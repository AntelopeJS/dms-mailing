import type { ProviderCapabilities } from "@antelopejs/interface-email";
import type { SendSummary } from "../db";
import { isResolvedStage, type SendStatus } from "../types";
import {
  aggregate,
  deltaPercent,
  isDeliveryUntracked,
  type ProviderTracking,
} from "./metrics";

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

const isQueued = (send: SendSummary): boolean => send.status === "queued";

function oldestQueuedAt(sends: SendSummary[]): string | null {
  const queued = sends
    .filter(isQueued)
    .map((send) => new Date(send.createdAt).getTime());
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

function problemBreakdown(real: SendSummary[]): ProblemBreakdown {
  const open = real.filter((send) => !isResolvedStage(send.stage));
  const countOf = (status: SendStatus): number =>
    open.filter((send) => send.status === status).length;
  const bounced = countOf("bounced");
  const failed = countOf("failed");
  const spam = countOf("spam");
  return { problems: bounced + failed + spam, bounced, failed, spam };
}

const isRealSend = (send: SendSummary): boolean => !send.isTest;

function comparedStats(
  previous: SendSummary[],
  tracking: ProviderTracking | null,
): ComparedSendStats {
  const real = previous.filter(isRealSend);
  const totals = aggregate(real);
  return {
    sends: totals.sends,
    deliverability: isDeliveryUntracked(real, tracking)
      ? null
      : totals.deliverability,
    problems: problemBreakdown(real).problems,
    latencyMedian: totals.sends ? totals.latencyMedian : null,
  };
}

/** `previous` is `null` when the user turned the comparison off. */
export function buildSendStats(
  current: SendSummary[],
  previous: SendSummary[] | null,
  tracking: ProviderTracking | null = null,
): SendStats {
  const real = current.filter(isRealSend);
  const totals = aggregate(real);
  const compared = previous ? comparedStats(previous, tracking) : null;
  return {
    sends: totals.sends,
    sendsDelta: deltaPercent(totals.sends, compared?.sends ?? null),
    tests: current.length - real.length,
    delivered: totals.delivered,
    deliverability: totals.deliverability,
    isDeliveryUntracked: isDeliveryUntracked(real, tracking),
    ...problemBreakdown(real),
    queued: totals.queued,
    oldestQueuedAt: oldestQueuedAt(real),
    latencyMedian: totals.latencyMedian,
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

/** A provider failure that says the provider could not be reached at all. */
export function isTransportFailure(send: SendSummary): boolean {
  return isProviderFailure(send) && TRANSPORT_ERROR.test(send.error ?? "");
}
