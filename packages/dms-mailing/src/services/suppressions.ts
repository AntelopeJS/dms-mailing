import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  type MailingSuppression,
  normalizeAddress,
  type SendSummary,
  SuppressionModel,
} from "../db";
import type {
  SendEventType,
  SuppressionReason,
  SuppressionSummary,
} from "../types";

/** What the event of a send says about its address. */
export interface SuppressingEvent {
  type: SendEventType;
  isTest: boolean;
  isSoftBounce: boolean;
}

/** An address to put on the list. */
export interface SuppressionEntry {
  email: string;
  reason: SuppressionReason;
  sendId?: string;
  detail?: string;
  createdBy?: string;
}

const REASON_BY_EVENT: Partial<Record<SendEventType, SuppressionReason>> = {
  bounced: "hard_bounce",
  spam: "complaint",
  unsubscribed: "unsubscribe",
};

/**
 * Reasons a test send puts its address on the list too: an address that does
 * not exist does not exist for anyone. A spam report or an unsubscription on
 * a test is the editor's own gesture, not a recipient's choice.
 */
const REASONS_FROM_TESTS = new Set<SuppressionReason>(["hard_bounce"]);

/**
 * The reason an event puts its address on the suppression list, `null` when
 * it does not: a temporary bounce (a full mailbox) may get through later.
 */
export function suppressionReasonOf(
  event: SuppressingEvent,
): SuppressionReason | null {
  const reason = REASON_BY_EVENT[event.type];
  if (!reason) return null;
  if (event.type === "bounced" && event.isSoftBounce) return null;
  if (event.isTest && !REASONS_FROM_TESTS.has(reason)) return null;
  return reason;
}

export function summarizeSuppression(
  row: MailingSuppression,
): SuppressionSummary {
  return {
    id: row._id,
    email: row.email,
    reason: row.reason,
    createdAt: row.createdAt,
    sendId: row.sendId || undefined,
  };
}

/**
 * Puts an address on the tenant's suppression list; an address already on it
 * keeps its first reason.
 * @returns Whether the address was added
 */
export function suppressAddress(
  tenantId: string,
  entry: SuppressionEntry,
): Promise<boolean> {
  return GetModel(SuppressionModel, tenantId).add(entry);
}

/** The suppression entries of the addresses given, by normalized address. */
export async function suppressionsOf(
  tenantId: string,
  emails: string[],
): Promise<Map<string, MailingSuppression>> {
  const rows = await GetModel(SuppressionModel, tenantId).listByEmails(emails);
  return new Map(rows.map((row) => [normalizeAddress(row.email), row]));
}

/**
 * The ids of the sends whose address is on the suppression list today: a send
 * again of them would not leave.
 */
export async function suppressedSendIds(
  tenantId: string,
  sends: Pick<SendSummary, "_id" | "recipientEmail">[],
): Promise<Set<string>> {
  const entries = await suppressionsOf(
    tenantId,
    sends.map((send) => send.recipientEmail),
  );
  return new Set(
    sends
      .filter((send) => entries.has(normalizeAddress(send.recipientEmail)))
      .map((send) => send._id),
  );
}

/** The entry of one address, `null` when nothing stops sending to it. */
export async function findSuppression(
  tenantId: string,
  email: string,
): Promise<SuppressionSummary | null> {
  const row = await GetModel(SuppressionModel, tenantId).findByEmail(email);
  return row ? summarizeSuppression(row) : null;
}
