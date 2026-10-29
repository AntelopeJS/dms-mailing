import { timingSafeEqual } from "node:crypto";
import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  emitEmailEvent,
  type EmailEventPayload,
} from "../automation/email-event-trigger";
import {
  type MailingSend,
  type MailingSendEvent,
  SendEventModel,
  SendModel,
} from "../db";
import type { EmailEvent } from "@antelopejs/interface-dms-mailing";
import { publishSendUpdated } from "../realtime";
import type { SendEventType, SendStatus } from "../types";
import { notifyProblems } from "./notify";
import { suppressAddress, suppressionReasonOf } from "./suppressions";
import { isObject, isText } from "../validation/guards";

export interface SendCounters {
  status: SendStatus;
  opens: number;
  clicks: number;
}

type CounterKey = keyof Pick<SendCounters, "opens" | "clicks">;

const RANK: Record<SendStatus, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
  unsubscribed: 5,
  spam: 6,
  bounced: 7,
  failed: 7,
  suppressed: 8,
};

const COUNTERS: Partial<Record<SendEventType, CounterKey>> = {
  opened: "opens",
  clicked: "clicks",
};

const MAX_ACTIVITY_ATTEMPTS = 5;

const PROBLEM_EVENTS = new Set<SendStatus>(["bounced", "failed", "spam"]);

/**
 * Statuses a later sign of delivery overrides: a provider failure reported by
 * webhook (`421 4.3.0`) is often a deferral the provider retried.
 */
const DEFERRABLE_STATUSES = new Set<SendStatus>(["failed"]);
const CLEARED_ERROR = "";

const SOFT_BOUNCE_TYPE = /soft|transient|temporary/i;
const HARD_BOUNCE_TYPE = /hard|permanent/i;
/** A temporary SMTP answer: a `4xx` reply code or a `4.x.x` enhanced status. */
const SOFT_SMTP_ANSWER = /^\s*4\d\d\b|\b4\.\d{1,3}\.\d{1,3}\b/;

const textOf = (value: unknown): string => (isText(value) ? value : "");

/**
 * The provider's own words for a problem event (`550 5.1.1 Mailbox does not
 * exist`), kept on the send so the log shows why it failed. Other events
 * leave the stored error alone.
 */
export function problemReason(event: EmailEvent): string | undefined {
  if (!PROBLEM_EVENTS.has(event.type)) return undefined;
  const reason = event.details?.reason;
  return isText(reason) && reason ? reason : undefined;
}

function overridesStatus(current: SendStatus, next: SendStatus): boolean {
  if (DEFERRABLE_STATUSES.has(current))
    return next !== current && RANK[next] >= RANK.delivered;
  return RANK[next] > RANK[current];
}

export function applyEvent(
  current: SendCounters,
  type: SendEventType,
): SendCounters {
  const counter = COUNTERS[type];
  const next: SendCounters = { ...current };
  if (counter) next[counter] = current[counter] + 1;
  if (overridesStatus(current.status, type)) next.status = type;
  return next;
}

/**
 * Whether a bounce is temporary (a full mailbox, a greylisting): the
 * provider's `bounceType` when it gives one, else the SMTP answer's class.
 */
export function isSoftBounce(event: EmailEvent): boolean {
  const bounceType = textOf(event.details?.bounceType);
  if (SOFT_BOUNCE_TYPE.test(bounceType)) return true;
  if (HARD_BOUNCE_TYPE.test(bounceType)) return false;
  return SOFT_SMTP_ANSWER.test(textOf(event.details?.reason));
}

/**
 * The error the send keeps after an event: the provider's words for a
 * problem, none once a deferred failure turns out delivered, else unchanged.
 */
export function errorAfter(
  event: EmailEvent,
  previous: SendStatus,
  next: SendStatus,
): string | undefined {
  const reason = problemReason(event);
  if (reason) return reason;
  const recovered = DEFERRABLE_STATUSES.has(previous) && previous !== next;
  return recovered && !PROBLEM_EVENTS.has(next) ? CLEARED_ERROR : undefined;
}

function activityOf(send: MailingSend, event: EmailEvent) {
  const counters = applyEvent(
    { status: send.status, opens: send.opens, clicks: send.clicks },
    event.type,
  );
  return {
    ...counters,
    lastEventAt: event.at ?? new Date(),
    provider: event.provider,
    error: errorAfter(event, send.status, counters.status),
    isSoftBounce: event.type === "bounced" ? isSoftBounce(event) : undefined,
  };
}

async function publishEmailEvent(
  payload: EmailEventPayload,
  send: MailingSend,
): Promise<void> {
  emitEmailEvent(payload);
  publishSendUpdated(payload.tenantId, payload.sendId);
  await notifyProblems(payload.tenantId, {
    sendId: send._id,
    templateSlug: send.templateSlug,
    type: payload.type,
    isTest: send.isTest,
  });
}

const eventIdOf = (details: Record<string, unknown> | undefined): string =>
  textOf(details?.eventId);

type StoredEventIdentity = Pick<
  MailingSendEvent,
  "type" | "at" | "json_details"
>;
type IncomingEventIdentity = Pick<EmailEvent, "type" | "at" | "details">;

/**
 * Whether a stored event is the one a webhook delivers again: the same
 * provider event id, or the same type, time and details when it has none.
 */
export function isSameEvent(
  stored: StoredEventIdentity,
  event: IncomingEventIdentity,
): boolean {
  const eventId = eventIdOf(event.details);
  if (eventId) {
    const storedDetails: unknown = JSON.parse(stored.json_details || "{}");
    return (
      eventIdOf(isObject(storedDetails) ? storedDetails : undefined) === eventId
    );
  }
  if (!event.at || stored.type !== event.type) return false;
  return (
    new Date(stored.at).getTime() === event.at.getTime() &&
    stored.json_details === JSON.stringify(event.details ?? {})
  );
}

/** A provider retrying its webhook must not count the event twice. */
async function isRepeatedEvent(
  tenantId: string,
  event: EmailEvent,
): Promise<boolean> {
  const send = await GetModel(SendModel, tenantId).getByProviderMessageId(
    event.messageId,
  );
  if (!send) return false;
  const stored = await GetModel(SendEventModel, tenantId).getBySend(send._id);
  return stored.some((candidate) => isSameEvent(candidate, event));
}

async function acceptEmailActivity(
  tenantId: string,
  event: EmailEvent,
): Promise<MailingSend | undefined> {
  const sends = GetModel(SendModel, tenantId);
  for (let attempt = 0; attempt < MAX_ACTIVITY_ATTEMPTS; attempt++) {
    const send = await sends.getByProviderMessageId(event.messageId);
    if (!send || send.isRetiring) return undefined;
    const accepted = await sends.recordActivity(send, activityOf(send, event));
    if (accepted) return send;
  }
  throw new Error("Mailing activity conflicted repeatedly; retry the webhook");
}

/**
 * Puts the send's address on the suppression list when the event says
 * nothing more must reach it. The event is recorded whatever happens here.
 */
async function suppressAfterEvent(
  tenantId: string,
  send: MailingSend,
  event: EmailEvent,
): Promise<void> {
  const reason = suppressionReasonOf({
    type: event.type,
    isTest: send.isTest,
    isSoftBounce: event.type === "bounced" && isSoftBounce(event),
  });
  if (!reason) return;
  try {
    await suppressAddress(tenantId, {
      email: send.recipientEmail,
      reason,
      sendId: send._id,
      detail: textOf(event.details?.reason) || undefined,
    });
  } catch (error) {
    Logging.Error("[dms-mailing] Could not suppress an address:", error);
  }
}

export async function recordEmailEvent(
  tenantId: string,
  event: EmailEvent,
): Promise<boolean> {
  if (await isRepeatedEvent(tenantId, event)) return false;
  const send = await acceptEmailActivity(tenantId, event);
  if (!send) return false;
  const at = event.at ?? new Date();
  const recorded = await GetModel(SendEventModel, tenantId).insertForActiveSend(
    {
      sendId: send._id,
      type: event.type,
      at,
      json_details: JSON.stringify(event.details ?? {}),
    },
  );
  if (!recorded) return false;
  await suppressAfterEvent(tenantId, send, event);
  await publishEmailEvent(
    {
      tenantId,
      sendId: send._id,
      templateSlug: send.templateSlug,
      type: event.type,
      recipientEmail: send.recipientEmail,
    },
    send,
  );
  return true;
}

/**
 * Whether a webhook request carries the tenant's secret.
 *
 * Fails closed on a blank or missing stored secret: the event endpoint is the
 * module's only unauthenticated route, so "no secret configured" must refuse
 * everything rather than accept an empty header. The comparison itself is constant-time;
 * only the length is observable.
 */
export function webhookSecretMatches(
  provided: string | undefined,
  stored: string | undefined,
): boolean {
  if (!stored || !provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(stored);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
