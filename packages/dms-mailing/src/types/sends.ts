import type { SendStatus } from "@antelopejs/interface-dms-mailing";

/**
 * Send statuses and provider event types are part of the public interface:
 * they travel through `SendTemplate` and `RecordEmailEvent`, so they are
 * declared in the interface package and only re-exported here.
 */
export type {
  SendEventType,
  SendStatus,
} from "@antelopejs/interface-dms-mailing";

export const SEND_STATUSES: SendStatus[] = [
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

export const PROBLEM_STATUSES: SendStatus[] = ["bounced", "failed", "spam"];

/**
 * The send log tab a status belongs to. Stored next to the status so a tab is a
 * single-value filter: a view filter is AND-only and `is` compares one value.
 */
export type SendStage =
  | "problem"
  | "in_progress"
  | "delivered"
  | "engaged"
  | "unsubscribed";

export const SEND_STAGES: SendStage[] = [
  "problem",
  "in_progress",
  "delivered",
  "engaged",
  "unsubscribed",
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
};

export function stageOf(status: SendStatus): SendStage {
  return STAGE_BY_STATUS[status];
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
}
