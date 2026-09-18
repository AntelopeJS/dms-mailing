import { timingSafeEqual } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  emitEmailEvent,
  type EmailEventPayload,
} from "../automation/email-event-trigger";
import { type MailingSend, SendEventModel, SendModel } from "../db";
import type { EmailEvent } from "@antelopejs/interface-dms-mailing";
import { publishSendUpdated } from "../realtime";
import type { SendEventType, SendStatus } from "../types";
import { notifyBounce } from "./notify";

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
};

const COUNTERS: Partial<Record<SendEventType, CounterKey>> = {
  opened: "opens",
  clicked: "clicks",
};

const MAX_ACTIVITY_ATTEMPTS = 5;

export function applyEvent(
  current: SendCounters,
  type: SendEventType,
): SendCounters {
  const counter = COUNTERS[type];
  const next: SendCounters = { ...current };
  if (counter) next[counter] = current[counter] + 1;
  if (RANK[type] > RANK[current.status]) next.status = type;
  return next;
}

async function publishEmailEvent(payload: EmailEventPayload): Promise<void> {
  emitEmailEvent(payload);
  publishSendUpdated(payload.sendId);
  await notifyBounce(payload.tenantId, payload);
}

async function acceptEmailActivity(
  tenantId: string,
  event: EmailEvent,
): Promise<MailingSend | undefined> {
  const sends = GetModel(SendModel, tenantId);
  for (let attempt = 0; attempt < MAX_ACTIVITY_ATTEMPTS; attempt++) {
    const send = await sends.getByProviderMessageId(event.messageId);
    if (!send || send.isRetiring) return undefined;
    const accepted = await sends.recordActivity(send, {
      ...applyEvent(
        { status: send.status, opens: send.opens, clicks: send.clicks },
        event.type,
      ),
      lastEventAt: event.at ?? new Date(),
      provider: event.provider,
    });
    if (accepted) return send;
  }
  throw new Error("Mailing activity conflicted repeatedly; retry the webhook");
}

export async function recordEmailEvent(
  tenantId: string,
  event: EmailEvent,
): Promise<boolean> {
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
  await publishEmailEvent({
    tenantId,
    sendId: send._id,
    templateSlug: send.templateSlug,
    type: event.type,
    recipientEmail: send.recipientEmail,
  });
  return true;
}

/**
 * Whether a webhook request carries the tenant's secret.
 *
 * Fails closed on a blank stored secret: the event endpoint is the module's
 * only unauthenticated route, so "no secret configured" must refuse everything
 * rather than accept an empty header. The comparison itself is constant-time;
 * only the length is observable.
 */
export function webhookSecretMatches(
  provided: string | undefined,
  stored: string,
): boolean {
  if (!stored || !provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(stored);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
