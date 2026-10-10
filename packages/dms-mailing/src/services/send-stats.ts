import type { SendSummary } from "../db";
import { aggregate, deltaPercent } from "./metrics";

/** The figures of the send log's stat strip, for one period. */
export interface SendStats {
  sends: number;
  sendsDelta: number;
  /** Test sends of the period, shown next to the count but not in it. */
  tests: number;
  delivered: number;
  deliverability: number;
  problems: number;
  bounced: number;
  failed: number;
  spam: number;
  queued: number;
  /** When the oldest send still queued was made; `null` with none queued. */
  oldestQueuedAt: string | null;
  latencyMedian: number;
}

const isQueued = (send: SendSummary): boolean => send.status === "queued";

function oldestQueuedAt(sends: SendSummary[]): string | null {
  const queued = sends
    .filter(isQueued)
    .map((send) => new Date(send.createdAt).getTime());
  if (!queued.length) return null;
  return new Date(Math.min(...queued)).toISOString();
}

export function buildSendStats(
  current: SendSummary[],
  previous: SendSummary[],
): SendStats {
  const real = current.filter((send) => !send.isTest);
  const totals = aggregate(real);
  const previousTotals = aggregate(previous.filter((send) => !send.isTest));
  return {
    sends: totals.sends,
    sendsDelta: deltaPercent(totals.sends, previousTotals.sends),
    tests: current.length - real.length,
    delivered: totals.delivered,
    deliverability: totals.deliverability,
    problems: totals.bounced + totals.failed + totals.spam,
    bounced: totals.bounced,
    failed: totals.failed,
    spam: totals.spam,
    queued: totals.queued,
    oldestQueuedAt: oldestQueuedAt(real),
    latencyMedian: totals.latencyMedian,
  };
}

/** Provider failures worth a send again: failed, not a bounce, not a test. */
export function isProviderFailure(send: SendSummary): boolean {
  return send.status === "failed" && !send.isTest;
}
