import type {
  SendEventType,
  SendStatus,
} from "@antelopejs/interface-dms-mailing";

/**
 * Send statuses and provider event types are part of the public interface:
 * they travel through `SendTemplate` and `RecordEmailEvent`, so they are
 * declared in the interface package and only re-exported here.
 */
export type {
  SendEventType,
  SendStatus,
} from "@antelopejs/interface-dms-mailing";

/** What a provider reports; a webhook carries one of these. */
export const SEND_EVENT_TYPES: SendEventType[] = [
  "queued",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "spam",
  "failed",
  "unsubscribed",
];

/** Every status of a send: the provider's events, and `suppressed`. */
export const SEND_STATUSES: SendStatus[] = [...SEND_EVENT_TYPES, "suppressed"];

export const PROBLEM_STATUSES: SendStatus[] = ["bounced", "failed", "spam"];

/**
 * The send log tab a status belongs to. Stored next to the status so a tab is a
 * single-value filter: a view filter is AND-only and `is` compares one value.
 * A problem someone already sent again or to another address is `resolved`:
 * it leaves the Problems tab, the nav badge and the provider banner.
 */
export type SendStage =
  | "problem"
  | "in_progress"
  | "delivered"
  | "engaged"
  | "unsubscribed"
  | "suppressed"
  | "resolved";

export const SEND_STAGES: SendStage[] = [
  "problem",
  "in_progress",
  "delivered",
  "engaged",
  "unsubscribed",
  "suppressed",
  "resolved",
];

export const STAGE_BY_STATUS: Record<SendStatus, SendStage> = {
  queued: "in_progress",
  sent: "in_progress",
  delivered: "delivered",
  opened: "engaged",
  clicked: "engaged",
  bounced: "problem",
  spam: "problem",
  failed: "problem",
  unsubscribed: "unsubscribed",
  suppressed: "suppressed",
};

const RESOLVABLE_STAGE: SendStage = "problem";
export const RESOLVED_STAGE: SendStage = "resolved";

export function stageOf(status: SendStatus, isResolved = false): SendStage {
  const stage = STAGE_BY_STATUS[status];
  return isResolved && stage === RESOLVABLE_STAGE ? RESOLVED_STAGE : stage;
}

/** Whether someone already dealt with this send's problem. */
export function isResolvedStage(stage: SendStage | undefined): boolean {
  return stage === RESOLVED_STAGE;
}

/**
 * Which sends a metric describes. The Overview is the business view and hides
 * test sends; the Sends page is the operational log and counts what actually
 * went through the provider.
 */
export type SendAudience = "business" | "operational";

export const SEND_AUDIENCE_QUERY_KEY = "audience";

export const BUSINESS_AUDIENCE = "business";
export const OPERATIONAL_AUDIENCE = "operational";

export interface SendEventDetails {
  url?: string;
  userAgent?: string;
  reason?: string;
  code?: string;
  /** The provider's own id of the event, to ignore a webhook it retries. */
  eventId?: string;
  /** `soft`/`transient` or `hard`/`permanent`, when the provider says so. */
  bounceType?: string;
}
