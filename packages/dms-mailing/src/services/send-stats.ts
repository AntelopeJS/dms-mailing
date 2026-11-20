import { GetModel } from "@antelopejs/interface-database-decorators";
import type { ProviderCapabilities } from "@antelopejs/interface-email";
import {
  type LatencySample,
  SendModel,
  type SendSummary,
  type SendTally,
} from "../db";
import { isResolvedStage, type SendStatus } from "../types";
import {
  aggregate,
  countOf,
  type DateRange,
  deltaPercent,
  isDeliveryUntracked,
  latencyMedian,
  type ProviderTracking,
} from "./metrics";
import { readCapabilities } from "./provider";

/**
 * A period's sends as the strip reads them: every send tallied, and the
 * latency of each real send, which a median needs one by one.
 */
export interface SendWindow {
  tallies: SendTally[];
  latencies: LatencySample[];
}

/** The figures of the send log's stat strip, for one period. */
export interface SendStats {
  sends: number;
  /** `null` when the previous period had no send to compare with. */
  sendsDelta: number | null;
  /** Test sends of the period, shown next to the count but not in it. */
  tests: number;
  delivered: number;
  /** `null` without a real send in the period. */
  deliverability: number | null;
  /**
   * The provider reports no delivery (SMTP) and no webhook event came back:
   * every send stays "sent", and a deliverability would mislead.
   */
  isDeliveryUntracked: boolean;
  /**
   * Problems nobody dealt with yet, like the Problems tab and the nav badge: a
   * send again resolves its original. The breakdown counts the same sends.
   */
  problems: number;
  bounced: number;
  failed: number;
  spam: number;
  queued: number;
  /** When the oldest send still queued was made; `null` with none queued. */
  oldestQueuedAt: string | null;
  latencyMedian: number;
  /** The same figures over the comparison window; `null` with it turned off. */
  compared: ComparedSendStats | null;
}

/**
 * The figures of the strip a comparison window states. The queue is left out:
 * it is what waits now, and what waited back then has long left.
 */
export interface ComparedSendStats {
  sends: number;
  /** `null` without a real send, or when nothing reported deliveries. */
  deliverability: number | null;
  problems: number;
  /** `null` without a real send to time. */
  latencyMedian: number | null;
}

function oldestQueuedAt(sends: SendTally[]): string | null {
  const queued = sends
    .filter((send) => send.status === "queued")
    .map((send) => send.firstAtMs);
  if (!queued.length) return null;
  return new Date(Math.min(...queued)).toISOString();
}

/** What the provider says it tracks; `null` while it cannot be reached. */
export function trackingOf(
  capabilities: ProviderCapabilities | null,
): ProviderTracking | null {
  if (!capabilities) return null;
  return {
    name: capabilities.name,
    openTracking: capabilities.features.openTracking,
    clickTracking: capabilities.features.clickTracking,
  };
}

type ProblemBreakdown = Pick<
  SendStats,
  "problems" | "bounced" | "failed" | "spam"
>;

function problemBreakdown(real: SendTally[]): ProblemBreakdown {
  const open = real.filter((send) => !send.isResolved);
  const countWith = (status: SendStatus): number =>
    countOf(open, (send) => send.status === status);
  const bounced = countWith("bounced");
  const failed = countWith("failed");
  const spam = countWith("spam");
  return { problems: bounced + failed + spam, bounced, failed, spam };
}

const isRealSend = (send: SendTally): boolean => !send.isTest;

function comparedStats(
  previous: SendWindow,
  tracking: ProviderTracking | null,
): ComparedSendStats {
  const real = previous.tallies.filter(isRealSend);
  const totals = aggregate(real);
  return {
    sends: totals.sends,
    deliverability: isDeliveryUntracked(real, tracking)
      ? null
      : totals.deliverability,
    problems: problemBreakdown(real).problems,
    latencyMedian: totals.sends ? latencyMedian(previous.latencies) : null,
  };
}

/** `previous` is `null` when the user turned the comparison off. */
export function buildSendStats(
  current: SendWindow,
  previous: SendWindow | null,
  tracking: ProviderTracking | null = null,
): SendStats {
  const real = current.tallies.filter(isRealSend);
  const totals = aggregate(real);
  const compared = previous ? comparedStats(previous, tracking) : null;
  return {
    sends: totals.sends,
    sendsDelta: deltaPercent(totals.sends, compared?.sends ?? null),
    tests: countOf(current.tallies) - countOf(real),
    delivered: totals.delivered,
    deliverability: totals.deliverability,
    isDeliveryUntracked: isDeliveryUntracked(real, tracking),
    ...problemBreakdown(real),
    queued: totals.queued,
    oldestQueuedAt: oldestQueuedAt(real),
    latencyMedian: latencyMedian(current.latencies),
    compared,
  };
}

/** At most this many failures go again in one "send the failures again". */
export const MAX_BULK_REPLAY = 100;

/** An error of the connection to the provider rather than of one recipient. */
const TRANSPORT_ERROR =
  /ECONN|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND|EAI_AGAIN|ESOCKET|timed? ?out|connection/i;

/**
 * Provider failures worth a send again: failed, not a bounce, not a test, and
 * not already sent again by someone.
 */
export function isProviderFailure(send: SendSummary): boolean {
  return (
    send.status === "failed" && !send.isTest && !isResolvedStage(send.stage)
  );
}

/**
 * Whether a provider failure says the provider could not be reached at all,
 * rather than a recipient refused. `failure` is one `isProviderFailure` keeps.
 */
export function isTransportFailure(
  failure: Pick<SendSummary, "error">,
): boolean {
  return TRANSPORT_ERROR.test(failure.error ?? "");
}

/** The window's sends tallied, and the latencies of its real ones. */
async function sendWindowOf(
  tenantId: string,
  range: DateRange,
): Promise<SendWindow> {
  const sends = GetModel(SendModel, tenantId);
  const scope = { from: range.from, to: range.to };
  const [tallies, latencies] = await Promise.all([
    sends.tally({ ...scope, isTestLeftOut: false }, { by: "none" }),
    sends.listLatencies({ ...scope, isTestLeftOut: true }),
  ]);
  return { tallies, latencies };
}

/**
 * The send log's figures of a tenant over `range`, compared with `previous`
 * when given, as the stat strip computes them.
 */
export async function sendStatsFor(
  tenantId: string,
  range: DateRange,
  previous: DateRange | null,
): Promise<SendStats> {
  const [current, compared, capabilities] = await Promise.all([
    sendWindowOf(tenantId, range),
    previous ? sendWindowOf(tenantId, previous) : null,
    readCapabilities(),
  ]);
  return buildSendStats(current, compared, trackingOf(capabilities));
}
