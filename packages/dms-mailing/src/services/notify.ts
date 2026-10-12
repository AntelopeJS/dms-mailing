import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import {
  GeneralSubject,
  Notification,
} from "@antelopejs/interface-dms/notifications";
import type { NotificationData } from "@antelopejs/interface-dms/notifications/types";
import { type SendSummary, SendModel } from "../db";
import { PROBLEM_STATUSES, type SendEventType } from "../types";

/** The problem event that may tip a template over the alert threshold. */
export interface ProblemNotificationInput {
  sendId: string;
  templateSlug: string;
  type: SendEventType;
  isTest: boolean;
}

/** A template's real sends of the last hour, and how many had a problem. */
export interface ProblemWindow {
  sends: number;
  problems: number;
}

export interface IdempotentNotificationTarget {
  toUsersIdempotently(userIds: string[], idempotencyKey: string): Promise<void>;
}

export interface ProblemNotificationData extends NotificationData {
  linkTo: string;
  params: Record<string, string | number>;
}

/** Below this many problems in the hour a template is not worth a ping. */
export const ALERT_MIN_PROBLEMS = 3;
/** Share of the hour's sends, in percent, that must have had a problem. */
export const ALERT_MIN_RATE = 5;
export const ALERT_WINDOW_MS = 3_600_000;

const PERCENT = 100;
const SENDS_PAGE = "/modules/mailing/sends";
const PROBLEMS_VIEW = "problems";
const IDEMPOTENCY_KEY_SEPARATOR = ":";
const PROBLEMS_ICON = "i-ph-warning";
const PROBLEMS_TITLE = "$dms_mailing.notifications.problems_title";
const PROBLEMS_DESCRIPTION = "$dms_mailing.notifications.problems_description";
const DUPLICATE_KEY_CODE = 11000;
const DUPLICATE_KEY_MESSAGE = /E11000|duplicate key/i;

interface CodedError {
  code?: unknown;
}

/** Only a real send's problem counts: a test bouncing is the tester's business. */
export function shouldNotify(input: ProblemNotificationInput): boolean {
  return PROBLEM_STATUSES.includes(input.type) && !input.isTest;
}

export function problemRate(window: ProblemWindow): number {
  return window.sends
    ? Math.round((window.problems * PERCENT) / window.sends)
    : 0;
}

/** Whether a template's last hour went wrong often enough to tell its owners. */
export function crossesThreshold(window: ProblemWindow): boolean {
  return (
    window.problems >= ALERT_MIN_PROBLEMS &&
    problemRate(window) >= ALERT_MIN_RATE
  );
}

export function problemWindowOf(sends: SendSummary[]): ProblemWindow {
  const real = sends.filter((send) => !send.isTest);
  return {
    sends: real.length,
    problems: real.filter((send) => PROBLEM_STATUSES.includes(send.status))
      .length,
  };
}

/** The send log on the Problems tab, the drawer open on the send that tipped it. */
export function problemsLink(sendId: string): string {
  const query = new URLSearchParams({ view: PROBLEMS_VIEW, record: sendId });
  return `${SENDS_PAGE}?${query.toString()}`;
}

export function problemsNotification(
  input: ProblemNotificationInput,
  window: ProblemWindow,
): ProblemNotificationData {
  return {
    icon: PROBLEMS_ICON,
    title: PROBLEMS_TITLE,
    description: PROBLEMS_DESCRIPTION,
    subject: GeneralSubject,
    linkTo: problemsLink(input.sendId),
    params: {
      count: window.problems,
      slug: input.templateSlug,
      rate: problemRate(window),
    },
  };
}

/** One notification per template and clock hour, however many problems follow. */
export function problemsIdempotencyKey(
  input: ProblemNotificationInput,
  at: Date,
): string {
  const hour = Math.floor(at.getTime() / ALERT_WINDOW_MS);
  return `${input.templateSlug}${IDEMPOTENCY_KEY_SEPARATOR}${hour}`;
}

/**
 * Whether the store refused a notification because the hour's key already
 * has one. Later problems of the hour carry other figures, which the DMS
 * reports as a duplicate key rather than as the same delivery.
 */
export function isAlreadyNotified(error: unknown): boolean {
  const code = (error as CodedError | null)?.code;
  return (
    code === DUPLICATE_KEY_CODE || DUPLICATE_KEY_MESSAGE.test(String(error))
  );
}

export async function deliverProblemsNotification(
  target: IdempotentNotificationTarget,
  userIds: string[],
  idempotencyKey: string,
): Promise<void> {
  try {
    await target.toUsersIdempotently(userIds, idempotencyKey);
  } catch (error) {
    if (!isAlreadyNotified(error)) throw error;
  }
}

async function tenantOwnerIds(tenantId: string): Promise<string[]> {
  const owners = await GetModel(TenantMemberModel, tenantId).listOwners();
  return owners.map((owner) => owner.userId);
}

async function lastHourOf(
  tenantId: string,
  templateSlug: string,
  now: Date,
): Promise<ProblemWindow> {
  const since = new Date(now.getTime() - ALERT_WINDOW_MS);
  const sends = await GetModel(SendModel, tenantId).listForTemplate(
    templateSlug,
    since,
  );
  return problemWindowOf(sends);
}

async function sendProblemsNotification(
  tenantId: string,
  input: ProblemNotificationInput,
  now: Date,
): Promise<void> {
  const window = await lastHourOf(tenantId, input.templateSlug, now);
  if (!crossesThreshold(window)) return;
  const userIds = await tenantOwnerIds(tenantId);
  if (userIds.length === 0) return;
  const data = problemsNotification(input, window);
  const notification = Notification()
    .icon(data.icon)
    .title(data.title)
    .description(data.description)
    .subject(data.subject)
    .linkTo(data.linkTo)
    .params(data.params)
    .build();
  await deliverProblemsNotification(
    notification,
    userIds,
    problemsIdempotencyKey(input, now),
  );
}

/**
 * Tells the tenant's owners once a template's real sends keep failing: one
 * aggregated notification per template and hour, past a threshold, never one
 * per bounce.
 */
export async function notifyProblems(
  tenantId: string,
  input: ProblemNotificationInput,
  now: Date = new Date(),
): Promise<void> {
  if (!shouldNotify(input)) return;
  try {
    await sendProblemsNotification(tenantId, input, now);
  } catch (error) {
    Logging.Error(
      `[dms-mailing] Failed to notify the problems of "${input.templateSlug}": ${String(error)}`,
    );
  }
}
