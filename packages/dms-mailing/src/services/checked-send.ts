import type { EmailAddress } from "@antelopejs/interface-email";
import type { SendTemplateResult } from "@antelopejs/interface-dms-mailing";
import { type MailingSuppression, normalizeAddress } from "../db";
import {
  aggregateResults,
  type DeliveredMessage,
  type ModuleSendParams,
  prepare,
  recordAll,
  sendTemplate,
} from "./send";
import { suppressionsOf } from "./suppressions";

/**
 * A send the module checks against the suppression list. `allowSuppressed`
 * names the addresses that still get it: the editor's own address on a test.
 */
export interface CheckedSendParams extends ModuleSendParams {
  allowSuppressed?: string[];
}

/** Why nothing was sent to a recipient, as the log and the dialogs say it. */
export const SUPPRESSED_ERROR_PREFIX = "$dms_mailing.errors.suppressed.";

const NO_LATENCY = null;

const addressOf = (to: EmailAddress): string =>
  typeof to === "string" ? to : to.email;

const toRecipients = (to: EmailAddress | EmailAddress[]): EmailAddress[] =>
  Array.isArray(to) ? to : [to];

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
  blocked: EmailAddress[],
  rows: Map<string, MailingSuppression>,
): Promise<SendTemplateResult[]> {
  const prepared = await prepare(params.tenantId, slug, params);
  const messages = blocked.map((to) =>
    suppressedMessage(
      to,
      rows.get(normalizeAddress(addressOf(to))) as MailingSuppression,
    ),
  );
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

/**
 * Sends a template to every recipient but those on the suppression list,
 * which are logged as `suppressed` instead. The results keep the order the
 * recipients were given in.
 */
export async function sendUnlessSuppressed(
  slug: string,
  params: CheckedSendParams,
): Promise<SendTemplateResult> {
  const recipients = toRecipients(params.to);
  const rows = await blockedRecipients(params, recipients);
  if (!rows.size) return sendTemplate(slug, params);
  const isBlocked = (to: EmailAddress): boolean =>
    rows.has(normalizeAddress(addressOf(to)));
  const blocked = recipients.filter(isBlocked);
  const suppressedResults = await recordSuppressed(slug, params, blocked, rows);
  const sentResults = await sendAllowed(
    slug,
    params,
    recipients.filter((to) => !isBlocked(to)),
  );
  return aggregateResults(
    recipients.map(
      (to) =>
        (isBlocked(to)
          ? suppressedResults.shift()
          : sentResults.shift()) as SendTemplateResult,
    ),
  );
}
