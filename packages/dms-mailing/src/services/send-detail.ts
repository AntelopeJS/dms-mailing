import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  type MailingSend,
  type MailingSendEvent,
  SendEventModel,
  SendModel,
} from "../db";
import type { SuppressionSummary } from "../types";
import { findSuppression } from "./suppressions";

/** One send of the log, its events oldest first, and its address's entry. */
export interface SendDetail {
  send: MailingSend;
  events: MailingSendEvent[];
  /** The recipient's entry on the suppression list, `null` when it has none. */
  suppression: SuppressionSummary | null;
}

/** A send of the tenant's log with its timeline; absent when there is none. */
export async function sendDetail(
  tenantId: string,
  sendId: string,
): Promise<SendDetail | undefined> {
  const send = await GetModel(SendModel, tenantId).get(sendId);
  if (!send) return undefined;
  const [events, suppression] = await Promise.all([
    GetModel(SendEventModel, tenantId).getBySend(sendId),
    findSuppression(tenantId, send.recipientEmail),
  ]);
  events.sort((left, right) => left.at.getTime() - right.at.getTime());
  return { send, events, suppression };
}
