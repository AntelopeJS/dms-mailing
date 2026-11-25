import type { EmailAddress } from "@antelopejs/interface-email";
import type { SendTemplateResult } from "@antelopejs/interface-dms-mailing";
import type { ResolvedEmail } from "../types";
import { type MailingSuppression, normalizeAddress } from "../db";
import {
  aggregateResults,
  type DeliveredMessage,
  type ModuleSendParams,
  type PreparedSend,
  prepare,
  recordAll,
  renderForSend,
  sendTemplate,
  UNRECORDED_SEND_ID,
} from "./send";
import { SendError } from "./send-error";
import { readSettings } from "./settings";
import { suppressionsOf } from "./suppressions";
import { addressOf, toRecipients } from "./addresses";
import { isSendableAddress } from "../validation/suppressions.schema";

/**
 * A send the module checks against the suppression list. `allowSuppressed`
 * names the addresses that still get it: the editor's own address on a test.
 */
export interface CheckedSendParams extends ModuleSendParams {
  allowSuppressed?: string[];
}

/** Why a simulated send would not reach an address that is no e-mail address. */
const INVALID_RECIPIENT_ERROR = "$dms_mailing.errors.invalid_recipient";

/** Why nothing was sent to a recipient, as the log and the dialogs say it. */
export const SUPPRESSED_ERROR_PREFIX = "$dms_mailing.errors.suppressed.";

const NO_LATENCY = null;

/** The error a suppressed recipient's send keeps: an i18n key per reason. */
export function suppressedError(row: MailingSuppression): string {
  return `${SUPPRESSED_ERROR_PREFIX}${row.reason}`;
}

/** The entry of each recipient nothing may be sent to, by its address. */
async function blockedRecipients(
  params: CheckedSendParams,
  recipients: EmailAddress[],
): Promise<Map<string, MailingSuppression>> {
  const suppressed = await suppressionsOf(
    params.tenantId,
    recipients.map(addressOf),
  );
  for (const allowed of params.allowSuppressed ?? []) {
    suppressed.delete(normalizeAddress(allowed));
  }
  return suppressed;
}

function suppressedMessage(
  to: EmailAddress,
  row: MailingSuppression,
): DeliveredMessage {
  return {
    to,
    status: "suppressed",
    outcome: { latencyMs: NO_LATENCY, error: suppressedError(row) },
  };
}

/**
 * Logs a `suppressed` send for each blocked recipient, after the same checks
 * as a real send: an unknown or paused template is still refused.
 */
async function recordSuppressed(
  slug: string,
  params: CheckedSendParams,
  blocked: { to: EmailAddress; row: MailingSuppression }[],
): Promise<SendTemplateResult[]> {
  const prepared = await prepare(params.tenantId, slug, params);
  const messages = blocked.map(({ to, row }) => suppressedMessage(to, row));
  return recordAll(prepared, params, messages);
}

async function sendAllowed(
  slug: string,
  params: CheckedSendParams,
  allowed: EmailAddress[],
): Promise<SendTemplateResult[]> {
  if (!allowed.length) return [];
  const result = await sendTemplate(slug, { ...params, to: allowed });
  return result.results ?? [result];
}

/** The send without the copied addresses that are on the suppression list. */
async function withoutSuppressedCc(
  params: CheckedSendParams,
): Promise<CheckedSendParams> {
  if (!params.cc?.length) return params;
  const blocked = await blockedRecipients(params, params.cc);
  return {
    ...params,
    cc: params.cc.filter((to) => !blocked.has(normalizeAddress(addressOf(to)))),
  };
}

/**
 * Sends a template to every recipient but those on the suppression list,
 * which are logged as `suppressed` instead. The results keep the order the
 * recipients were given in.
 */
export async function sendUnlessSuppressed(
  slug: string,
  given: CheckedSendParams,
): Promise<SendTemplateResult> {
  const params = await withoutSuppressedCc(given);
  const recipients = toRecipients(params.to);
  const rows = await blockedRecipients(params, recipients);
  if (!rows.size) return sendTemplate(slug, params);
  const rowOf = (to: EmailAddress) => rows.get(normalizeAddress(addressOf(to)));
  const isBlocked = (to: EmailAddress): boolean => rowOf(to) !== undefined;
  const blocked = recipients.flatMap((to) => {
    const row = rowOf(to);
    return row ? [{ to, row }] : [];
  });
  const suppressedResults = await recordSuppressed(slug, params, blocked);
  const sentResults = await sendAllowed(
    slug,
    params,
    recipients.filter((to) => !isBlocked(to)),
  );
  let nextSuppressed = 0;
  let nextSent = 0;
  return aggregateResults(
    recipients.map((to) =>
      isBlocked(to)
        ? suppressedResults[nextSuppressed++]
        : sentResults[nextSent++],
    ),
  );
}

/** What a send would deliver, worked out without sending or storing anything. */
interface SendPreview {
  prepared: PreparedSend;
  email: ResolvedEmail;
}

/**
 * Runs the checks of a send, renders what it would deliver and discards it:
 * the same refusals as a send, with no settings row created, no send
 * recorded and no provider called.
 */
async function previewSend(
  slug: string,
  params: ModuleSendParams,
): Promise<SendPreview> {
  const prepared = await prepare(params.tenantId, slug, params, readSettings);
  const settings = await readSettings(params.tenantId);
  const { email } = await renderForSend(
    prepared,
    params,
    settings.blockOnMissingVariables,
  );
  return { prepared, email };
}

/** What a simulated send would have done, and what it would have delivered. */
export interface SimulatedSend {
  result: SendTemplateResult;
  /** `null` when every recipient is suppressed: nothing would be rendered. */
  preview: SendPreview | null;
  suppressed: number;
}

function simulatedResult(
  to: EmailAddress,
  row: MailingSuppression | undefined,
): SendTemplateResult {
  if (row)
    return {
      sendId: UNRECORDED_SEND_ID,
      status: "suppressed",
      error: suppressedError(row),
    };
  if (!isSendableAddress(addressOf(to)))
    return {
      sendId: UNRECORDED_SEND_ID,
      status: "failed",
      error: INVALID_RECIPIENT_ERROR,
    };
  return { sendId: UNRECORDED_SEND_ID, status: "sent" };
}

/**
 * Runs the checks of {@link sendUnlessSuppressed} in the same order without
 * writing or sending anything: the same refusals, and per recipient the
 * outcome a send would have, `sent` standing for "would leave".
 */
export async function simulateUnlessSuppressed(
  slug: string,
  params: CheckedSendParams,
): Promise<SimulatedSend> {
  const recipients = toRecipients(params.to);
  if (recipients.length === 0)
    throw new SendError("no_recipient", `Template "${slug}" has no recipient`);
  const rows = await blockedRecipients(params, recipients);
  const rowOf = (to: EmailAddress) => rows.get(normalizeAddress(addressOf(to)));
  const isAnyAllowed = recipients.some((to) => rowOf(to) === undefined);
  const preview = isAnyAllowed ? await previewSend(slug, params) : null;
  if (!preview) await prepare(params.tenantId, slug, params, readSettings);
  const results = recipients.map((to) => simulatedResult(to, rowOf(to)));
  return {
    result: aggregateResults(results),
    preview,
    suppressed: results.filter((entry) => entry.status === "suppressed").length,
  };
}
