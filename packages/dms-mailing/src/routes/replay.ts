import type { SendTemplateResult } from "@antelopejs/interface-dms-mailing";
import type { MailingSend } from "../db";
import type { SendStage, SendStatus } from "../types";

const REPLAY_PARTIAL = "$dms_mailing.sends.banner.replay_partial";
const REPLAY_SKIPPED = "$dms_mailing.sends.banner.replay_skipped";

/** A problem someone already sent again: it is not sent a second time. */
export const ALREADY_REPLAYED = "$dms_mailing.errors.already_replayed";

/** The stage a send again claims before it goes, so two of them never both send. */
const PROBLEM_STAGE: SendStage = "problem";

/**
 * What a send again did. When the address is on the suppression list nothing
 * left: `status` is `suppressed`, the original stays a problem, and `warning`
 * carries the reason for the toast.
 */
export interface ReplayResponse extends SendTemplateResult {
  warning?: string;
}

/**
 * What "send the failures again" did: sent, failed to send again (could not
 * start, or the address went on the suppression list meanwhile), and left out
 * since the address is on the suppression list.
 */
export interface ReplayFailedResponse {
  count: number;
  failed: number;
  skipped: number;
  results: SendTemplateResult[];
  /** Tells the toast some failures could not be sent again. */
  warning?: string;
}

/** A failure someone else already sent again. */
export const CLAIMED_ELSEWHERE = "claimed-elsewhere";
/** A failure whose send again could not start: it stays a problem. */
export const NOT_STARTED = "not-started";

export type ClaimedReplay =
  | SendTemplateResult
  | typeof CLAIMED_ELSEWHERE
  | typeof NOT_STARTED;

/** Problem statuses whose address is at fault: repeating the send cannot help. */
const ADDRESS_PROBLEMS: SendStatus[] = ["bounced"];

/** A permanent bounce only takes another address; a temporary one may retry. */
export function needsNewAddress(send: MailingSend): boolean {
  return ADDRESS_PROBLEMS.includes(send.status) && !send.isSoftBounce;
}

/** Whether a send is in the Problems tab, where a send again resolves it. */
export function isProblemSend(send: Pick<MailingSend, "stage">): boolean {
  return send.stage === PROBLEM_STAGE;
}

export const isSuppressedResult = (result: SendTemplateResult): boolean =>
  result.status === "suppressed";

/** A suppressed send again carries its reason as a warning. */
export function replayResponse(result: SendTemplateResult): ReplayResponse {
  return isSuppressedResult(result)
    ? { ...result, warning: result.error }
    : result;
}

export function replayReport(
  results: SendTemplateResult[],
  notStarted: number,
  skipped: number,
): ReplayFailedResponse {
  const suppressed = results.filter(isSuppressedResult).length;
  const report: ReplayFailedResponse = {
    count: results.length - suppressed,
    failed: notStarted + suppressed,
    skipped,
    results,
  };
  const hasFailures =
    report.failed > 0 || results.some((result) => result.status === "failed");
  if (hasFailures) report.warning = REPLAY_PARTIAL;
  else if (skipped > 0) report.warning = REPLAY_SKIPPED;
  return report;
}
