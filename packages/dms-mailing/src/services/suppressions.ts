import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  type AddressSuppressedPayload,
  addressSuppressedChannel,
} from "../automation/address-suppressed-trigger";
import {
  type AddressUnsuppressedPayload,
  addressUnsuppressedChannel,
} from "../automation/address-unsuppressed-trigger";
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

const NO_SEND = "";
const NO_AUTHOR = "";

const subjectOf = (tenantId: string, row: MailingSuppression): string =>
  `${tenantId}|${row._id}`;

function suppressedPayload(
  tenantId: string,
  row: MailingSuppression,
): AddressSuppressedPayload {
  const createdAt = new Date(row.createdAt);
  return {
    tenantId,
    suppressionId: row._id,
    email: row.email,
    reason: row.reason,
    sendId: row.sendId ?? NO_SEND,
    detail: row.detail || undefined,
    createdBy: row.createdBy ?? NO_AUTHOR,
    createdAt: createdAt.toISOString(),
    deliveryId: `${row._id}:${createdAt.getTime()}`,
  };
}

/** What putting an address on the list did, and the entry it left. */
export interface SuppressOutcome {
  added: boolean;
  /** The address's entry; absent when it was lifted in between. */
  row: MailingSuppression | undefined;
}

/**
 * Puts an address on the tenant's suppression list and reads its entry back;
 * an address already on it keeps its first reason. A new entry fires
 * `mailing.address-suppressed`.
 */
export async function suppressAddressAndRead(
  tenantId: string,
  entry: SuppressionEntry,
): Promise<SuppressOutcome> {
  const model = GetModel(SuppressionModel, tenantId);
  const added = await model.add(entry);
  const row = await model.findByEmail(entry.email);
  if (added && row)
    addressSuppressedChannel.emitOriginated(
      subjectOf(tenantId, row),
      suppressedPayload(tenantId, row),
    );
  return { added, row };
}

/**
 * Puts an address on the tenant's suppression list; an address already on it
 * keeps its first reason.
 * @returns Whether the address was added
 */
export async function suppressAddress(
  tenantId: string,
  entry: SuppressionEntry,
): Promise<boolean> {
  return (await suppressAddressAndRead(tenantId, entry)).added;
}

/** The stored entry of one address, with its note; absent when it has none. */
export function suppressionEntryOf(
  tenantId: string,
  email: string,
): Promise<MailingSuppression | undefined> {
  return GetModel(SuppressionModel, tenantId).findByEmail(email);
}

/** Which entry to lift: by its id (the dashboard) or by its address. */
export type LiftTarget = { id: string } | { email: string };

/** What lifting an entry did. */
export interface LiftOutcome {
  /** The entry as it was before; absent when there was none. */
  row: MailingSuppression | undefined;
  removed: boolean;
  /** The entry was kept: the caller's rule does not let it lift this one. */
  refused: boolean;
}

function unsuppressedPayload(
  tenantId: string,
  row: MailingSuppression,
  removedBy: string,
): AddressUnsuppressedPayload {
  const suppressedAt = new Date(row.createdAt);
  return {
    tenantId,
    suppressionId: row._id,
    email: row.email,
    reason: row.reason,
    sendId: row.sendId ?? NO_SEND,
    suppressedAt: suppressedAt.toISOString(),
    removedBy,
    removedAt: new Date().toISOString(),
    deliveryId: `${row._id}:${suppressedAt.getTime()}:removed`,
  };
}

function readTarget(
  model: SuppressionModel,
  target: LiftTarget,
): Promise<MailingSuppression | undefined> {
  return "id" in target
    ? model.get(target.id)
    : model.findByEmail(target.email);
}

/**
 * Takes an entry off the tenant's list: the next send reaches the address
 * again. The entry is read first, so the event says what was lifted; only the
 * call whose delete applied fires `mailing.address-unsuppressed`.
 * @param mayLift Refuses an entry this caller must not lift; it is kept.
 */
export async function liftSuppression(
  tenantId: string,
  target: LiftTarget,
  removedBy: string,
  mayLift: (row: MailingSuppression) => boolean = () => true,
): Promise<LiftOutcome> {
  const model = GetModel(SuppressionModel, tenantId);
  const row = await readTarget(model, target);
  if (!row) return { row, removed: false, refused: false };
  if (!mayLift(row)) return { row, removed: false, refused: true };
  const removed = (await model.delete(row._id)) > 0;
  if (removed)
    addressUnsuppressedChannel.emitOriginated(
      subjectOf(tenantId, row),
      unsuppressedPayload(tenantId, row, removedBy),
    );
  return { row, removed, refused: false };
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
