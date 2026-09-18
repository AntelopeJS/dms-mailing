import type { MailingSend } from "../db";
import {
  BUSINESS_AUDIENCE,
  OPERATIONAL_AUDIENCE,
  type SendAudience,
  type SendStatus,
} from "../types";

const AUDIENCE_KEEPS: Record<SendAudience, (send: MailingSend) => boolean> = {
  [BUSINESS_AUDIENCE]: (send) => !send.isTest,
  [OPERATIONAL_AUDIENCE]: () => true,
};

const AUDIENCE_BY_NAME: Record<string, SendAudience> = {
  [BUSINESS_AUDIENCE]: BUSINESS_AUDIENCE,
  [OPERATIONAL_AUDIENCE]: OPERATIONAL_AUDIENCE,
};

/** Named audience behind a query value; anything unknown is the business view. */
export function readAudience(raw: string | null | undefined): SendAudience {
  return AUDIENCE_BY_NAME[raw ?? ""] ?? BUSINESS_AUDIENCE;
}

export function forAudience(
  sends: MailingSend[],
  audience: SendAudience,
): MailingSend[] {
  return sends.filter(AUDIENCE_KEEPS[audience]);
}

export interface Totals {
  sends: number;
  queued: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
  spam: number;
  unsubscribed: number;
  deliverability: number;
  openRate: number;
  clickRate: number;
  latencyMedian: number;
}

export interface SeriesPoint {
  x: string;
  y: number;
}

export interface DateRange {
  from: Date;
  to: Date;
}

const PERCENT = 100;
const DAY_MS = 86_400_000;
const DAY_KEY_LENGTH = 10;
const DELTA_PRECISION = 1;
const DELIVERED_LIKE: SendStatus[] = [
  "delivered",
  "opened",
  "clicked",
  "unsubscribed",
  "spam",
];
const OPENED_LIKE: SendStatus[] = ["opened", "clicked"];

export const ratio = (part: number, whole: number): number =>
  whole ? (part / whole) * PERCENT : 0;

const countIf = (
  sends: MailingSend[],
  predicate: (send: MailingSend) => boolean,
): number => sends.filter(predicate).length;

const byStatus =
  (status: SendStatus) =>
  (send: MailingSend): boolean =>
    send.status === status;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] as number;
}

export function aggregate(sends: MailingSend[]): Totals {
  const delivered = countIf(sends, (send) =>
    DELIVERED_LIKE.includes(send.status),
  );
  const opened = countIf(sends, (send) => OPENED_LIKE.includes(send.status));
  const clicked = countIf(sends, byStatus("clicked"));
  return {
    sends: sends.length,
    queued: countIf(sends, byStatus("queued")),
    sent: countIf(sends, byStatus("sent")),
    delivered,
    opened,
    clicked,
    bounced: countIf(sends, byStatus("bounced")),
    failed: countIf(sends, byStatus("failed")),
    spam: countIf(sends, byStatus("spam")),
    unsubscribed: countIf(sends, byStatus("unsubscribed")),
    deliverability: ratio(delivered, sends.length),
    openRate: ratio(opened, delivered),
    clickRate: ratio(clicked, delivered),
    latencyMedian: median(sends.map((send) => send.latencyMs)),
  };
}

export function deltaPercent(current: number, previous: number): number {
  if (!previous) return 0;
  return Number(
    (((current - previous) / previous) * PERCENT).toFixed(DELTA_PRECISION),
  );
}

const dayKey = (date: Date): string =>
  date.toISOString().slice(0, DAY_KEY_LENGTH);

/**
 * One point per day of the window, counted from the window's own boundaries.
 *
 * The DMS period selector cuts on *local* midnights, so a UTC+2 tenant asks for
 * 2026-09-03T22:00Z → 2026-09-10T21:59:59.999Z. Buckets are therefore offsets
 * from `from` rather than UTC calendar days, and each is labelled by the date at
 * its middle, which lands on the tenant's own day for every offset strictly
 * inside ±12 h — every inhabited zone but UTC+13/+14, where the label falls a
 * day early. The boundaries alone cannot settle it: local midnight at UTC+13 and
 * at UTC−11 arrive at the same instant, so the midpoint picks the reading
 * closest to UTC.
 *
 * Counting whole buckets also keeps the last day: cutting the walk at `to` used
 * to drop it, so a send made today was missing from the chart while the KPI
 * still counted it.
 */
export function dailySeries(
  sends: MailingSend[],
  from: Date,
  to: Date,
): SeriesPoint[] {
  const start = from.getTime();
  const span = to.getTime() - start;
  const dayCount = Math.max(1, Math.ceil(span / DAY_MS));
  const counts: number[] = Array.from({ length: dayCount }, () => 0);
  for (const send of sends) {
    const offset = new Date(send.createdAt).getTime() - start;
    if (offset < 0 || offset >= dayCount * DAY_MS) continue;
    const index = Math.floor(offset / DAY_MS);
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts.map((y, index) => ({
    x: dayKey(new Date(start + index * DAY_MS + DAY_MS / 2)),
    y,
  }));
}

export function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

export function groupBy<T>(
  items: T[],
  key: (item: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const id = key(item);
    groups.set(id, [...(groups.get(id) ?? []), item]);
  }
  return groups;
}
