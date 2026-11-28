import { createHash } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import type { EmailAddress } from "@antelopejs/interface-email";
import type {
  SendTemplateParams,
  SendTemplateResult,
} from "@antelopejs/interface-dms-mailing";
import {
  type MailingSend,
  type NewSend,
  normalizeAddress,
  SendEventModel,
  SendModel,
} from "../db";
import { publishSendCreated } from "../realtime";
import { type SendStatus, stageOf } from "../types";
import { addressOf, nameOf } from "./addresses";
import { attachmentsLog } from "./attachments";
import type {
  DeliveredMessage,
  DeliveryInput,
  PreparedSend,
  SendOutcome,
  SendRecordInput,
} from "./send";
import { SendError } from "./send-error";

const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
/** The status a claimed send holds until the provider answers. */
const CLAIMED: SendStatus = "queued";
const NO_LATENCY = null;

/** Delivers an input's messages: `deliver` of `send.ts`, passed in so this module imports none of its runtime. */
export type Deliverer = (input: DeliveryInput) => Promise<DeliveredMessage[]>;

interface Claim {
  to: EmailAddress;
  sendId: string;
  isNew: boolean;
}

/** The caller's key of a send, checked; `undefined` when the call carries none. */
export function checkedIdempotencyKey(
  params: SendTemplateParams,
): string | undefined {
  const key = params.idempotencyKey;
  if (key === undefined) return undefined;
  if (key.length === 0 || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new SendError(
      "invalid_idempotency_key",
      `idempotencyKey must be 1 to ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
    );
  }
  return key;
}

/**
 * The row id a caller's key gives one recipient's send: the same call again
 * claims the same row, whatever the case of the address.
 */
export function keyedSendId(
  prepared: Pick<PreparedSend, "tenantId" | "slug">,
  key: string,
  to: EmailAddress,
): string {
  return createHash("sha256")
    .update(
      [
        prepared.tenantId,
        prepared.slug,
        key,
        normalizeAddress(addressOf(to)),
      ].join("\0"),
    )
    .digest("hex");
}

/** The row a send writes for one recipient, less its id, date and revision. */
export function sendRowOf(
  prepared: PreparedSend,
  params: SendTemplateParams,
  to: EmailAddress,
  status: SendStatus,
  outcome: SendOutcome,
): NewSend {
  return {
    templateId: prepared.templateId,
    templateSlug: prepared.slug,
    locale: prepared.locale,
    requestedLocale: prepared.requestedLocale,
    templateVersion: prepared.version,
    recipientEmail: addressOf(to),
    recipientName: nameOf(to),
    status,
    stage: stageOf(status),
    provider: outcome.provider,
    providerMessageId: outcome.providerMessageId,
    latencyMs: outcome.latencyMs,
    error: outcome.error,
    source: params.source,
    json_variables: JSON.stringify(params.variables ?? {}),
    json_attachments: attachmentsLog(prepared.attachments),
    json_cc: prepared.cc && JSON.stringify(prepared.cc.map(addressOf)),
    opens: 0,
    clicks: 0,
    isTest: Boolean(params.isTest),
    idempotencyKey: params.idempotencyKey,
  };
}

/** Writes the first history row of a send and tells the pages about it. */
export async function recordFirstEvent(
  tenantId: string,
  sendId: string,
  status: SendStatus,
  outcome: SendOutcome,
): Promise<void> {
  await GetModel(SendEventModel, tenantId).insertForActiveSend({
    sendId,
    type: status,
    at: new Date(),
    json_details: JSON.stringify(
      outcome.error ? { reason: outcome.error } : {},
    ),
  });
  publishSendCreated(tenantId, sendId);
}

/**
 * Records a send that went through no provider here, a suppressed recipient's,
 * under the caller's key: a repeat of the key writes nothing and answers the
 * row it finds.
 */
export async function recordKeyed(
  tenantId: string,
  input: SendRecordInput,
  key: string,
): Promise<string> {
  const { prepared, to, params, status, outcome } = input;
  const sendId = keyedSendId(prepared, key, to);
  const isNew = await GetModel(SendModel, tenantId).claimKeyedSend({
    ...sendRowOf(prepared, params, to, status, outcome),
    _id: sendId,
    createdAt: new Date(),
  });
  if (isNew) await recordFirstEvent(tenantId, sendId, status, outcome);
  return sendId;
}

function resultOf(
  sendId: string,
  status: SendStatus,
  outcome: SendOutcome,
): SendTemplateResult {
  return {
    sendId,
    status,
    messageId: outcome.providerMessageId,
    error: outcome.error,
  };
}

/** What an earlier call with the key recorded for the recipient; `queued` while it is still at it. */
function recordedResult(
  send: MailingSend | undefined,
  sendId: string,
): SendTemplateResult {
  if (!send) return { sendId, status: CLAIMED };
  return {
    sendId,
    status: send.status,
    messageId: send.providerMessageId,
    error: send.error,
  };
}

/**
 * Writes the provider's answer on a claimed send and its first history row.
 * A failure there answers `failed`, as `recordAll` does; the row keeps the
 * claim, so a retry of the key delivers nothing more.
 */
async function finish(
  sends: SendModel,
  tenantId: string,
  sendId: string,
  message: DeliveredMessage,
): Promise<SendTemplateResult> {
  try {
    const send = await sends.getSnapshot(sendId);
    if (send) {
      await sends.recordDelivery(send, {
        status: message.status,
        ...message.outcome,
      });
    }
    await recordFirstEvent(tenantId, sendId, message.status, message.outcome);
    return resultOf(sendId, message.status, message.outcome);
  } catch (error) {
    return {
      sendId,
      status: "failed",
      messageId: message.outcome.providerMessageId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Delivers to the recipients no earlier call with this key reached. Each is
 * claimed as a `queued` row before anything leaves, so a second call with the
 * key, after a timeout or a crash, finds the claim and sends nothing to that
 * recipient. Answers every recipient in order: the provider's outcome for a
 * recipient claimed here, the recorded outcome of the earlier call for the
 * others.
 */
export async function deliverOnce(
  input: DeliveryInput,
  params: SendTemplateParams,
  key: string,
  deliver: Deliverer,
): Promise<SendTemplateResult[]> {
  const { prepared } = input;
  const sends = GetModel(SendModel, prepared.tenantId);
  const claims: Claim[] = [];
  for (const to of input.recipients) {
    const sendId = keyedSendId(prepared, key, to);
    const isNew = await sends.claimKeyedSend({
      ...sendRowOf(prepared, params, to, CLAIMED, { latencyMs: NO_LATENCY }),
      _id: sendId,
      createdAt: new Date(),
    });
    claims.push({ to, sendId, isNew });
  }
  const fresh = claims.filter((claim) => claim.isNew);
  const delivered =
    fresh.length > 0
      ? await deliver({
          ...input,
          recipients: fresh.map((claim) => claim.to),
        })
      : [];
  const outcomes = new Map(
    fresh.map((claim, index) => [claim.sendId, delivered[index]]),
  );
  const results: SendTemplateResult[] = [];
  for (const claim of claims) {
    const message = outcomes.get(claim.sendId);
    results.push(
      message
        ? await finish(sends, prepared.tenantId, claim.sendId, message)
        : recordedResult(await sends.getSnapshot(claim.sendId), claim.sendId),
    );
  }
  return results;
}
