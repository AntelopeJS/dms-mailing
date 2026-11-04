import type { SendSummary } from "../db";
import {
  BUSINESS_AUDIENCE,
  OPERATIONAL_AUDIENCE,
  type SendAudience,
  type SendStatus,
} from "../types";

const AUDIENCE_KEEPS: Record<SendAudience, (send: SendSummary) => boolean> = {
  [BUSINESS_AUDIENCE]: (send) => !send.isTest,
  [OPERATIONAL_AUDIENCE]: () => true,
};

const isAudience = (raw: string): raw is SendAudience =>
  Object.hasOwn(AUDIENCE_KEEPS, raw);

/** Named audience behind a query value; anything unknown is the business view. */
export function readAudience(raw: string | null | undefined): SendAudience {
  return raw != null && isAudience(raw) ? raw : BUSINESS_AUDIENCE;
}

const STATS_WINDOW_DAYS = 30;

/** Where the per-template figures start: the last 30 days. */
export function statsWindowStart(now: number = Date.now()): Date {
  return new Date(now - STATS_WINDOW_DAYS * DAY_MS);
}

export function forAudience(
  sends: SendSummary[],
  audience: SendAudience,
): SendSummary[] {
  return sends.filter(AUDIENCE_KEEPS[audience]);
}

/**
 * The counters of a set of sends and the rates drawn from them. A rate is
 * `null` when its base is empty: "no e-mail delivered" is not "0 % opened".
 */
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
  deliverability: number | null;
  openRate: number | null;
  clickRate: number | null;
  latencyMedian: number;
}

/** Reads one figure out of the totals; `null` when it cannot be stated. */
export type TotalsExtractor = (totals: Totals) => number | null;

export interface SeriesPoint {
  x: string;
  y: number;
}

export interface DateRange {
  from: Date;
  to: Date;
}

/** The provider features the Overview's figures depend on. */
export interface ProviderTracking {
  name: string;
  openTracking: boolean;
  clickTracking: boolean;
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
/** Statuses only an event reported by the provider can set. */
const PROVIDER_EVENT_STATUSES: SendStatus[] = [...DELIVERED_LIKE, "bounced"];

export const ratio = (part: number, whole: number): number | null =>
  whole ? (part / whole) * PERCENT : null;

const countIf = (
  sends: SendSummary[],
  predicate: (send: SendSummary) => boolean,
): number => sends.filter(predicate).length;

const byStatus =
  (status: SendStatus) =>
  (send: SendSummary): boolean =>
    send.status === status;

const isDelivered = (send: SendSummary): boolean =>
  DELIVERED_LIKE.includes(send.status);

/**
 * Engagement outlives the final status: a send opened, clicked and then
 * unsubscribed (or reported as spam) was still opened and clicked, and a
 * click implies an open the pixel may have missed.
 */
const wasClicked = (send: SendSummary): boolean =>
  isDelivered(send) && (send.status === "clicked" || send.clicks > 0);

const wasOpened = (send: SendSummary): boolean =>
  isDelivered(send) &&
  (OPENED_LIKE.includes(send.status) || send.opens > 0 || send.clicks > 0);

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

/** A send to a suppressed address never left: no figure counts it. */
export const leftForProvider = (send: SendSummary): boolean =>
  send.status !== "suppressed";

export function aggregate(logged: SendSummary[]): Totals {
  const sends = logged.filter(leftForProvider);
  const delivered = countIf(sends, isDelivered);
  const opened = countIf(sends, wasOpened);
  const clicked = countIf(sends, wasClicked);
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
    latencyMedian: median(sends.flatMap((send) => send.latencyMs ?? [])),
  };
}

/**
 * The change from `previous` to `current`, in percent; `null` when no share
 * can be stated, a preceding zero included: growth away from nothing is
 * unbounded, and a "0 %" stand-in would read as "no change".
 */
export function deltaPercent(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || !previous) return null;
  return Number(
    (((current - previous) / previous) * PERCENT).toFixed(DELTA_PRECISION),
  );
}

const showsProviderEvent = (send: SendSummary): boolean =>
  PROVIDER_EVENT_STATUSES.includes(send.status) ||
  send.opens > 0 ||
  send.clicks > 0;

/**
 * Whether the window's delivery figures are unmeasured: the provider tracks
 * nothing itself (SMTP) and no event came back by webhook either, so every
 * send stays "sent" and a 0 % deliverability would be a false alarm. Unknown
 * capabilities (the provider unreachable) claim nothing.
 */
export function isDeliveryUntracked(
  sends: SendSummary[],
  tracking: ProviderTracking | null,
): boolean {
  if (!tracking || tracking.openTracking || tracking.clickTracking)
    return false;
  return sends.length > 0 && !sends.some(showsProviderEvent);
}

const dayKey = (date: Date): string =>
  date.toISOString().slice(0, DAY_KEY_LENGTH);

interface DayBucket {
  x: string;
  sends: SendSummary[];
}

/**
 * One bucket per day of the window, counted from the window's own boundaries.
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
function dailyBuckets(sends: SendSummary[], from: Date, to: Date): DayBucket[] {
  const start = from.getTime();
  const dayCount = Math.max(1, Math.ceil((to.getTime() - start) / DAY_MS));
  const buckets: DayBucket[] = Array.from({ length: dayCount }, (_, index) => ({
    x: dayKey(new Date(start + index * DAY_MS + DAY_MS / 2)),
    sends: [],
  }));
  for (const send of sends) {
    const offset = new Date(send.createdAt).getTime() - start;
    if (offset < 0 || offset >= dayCount * DAY_MS) continue;
    buckets[Math.floor(offset / DAY_MS)]?.sends.push(send);
  }
  return buckets;
}

/** The number of sends of each day of the window. */
export function dailySeries(
  sends: SendSummary[],
  from: Date,
  to: Date,
): SeriesPoint[] {
  return dailyBuckets(sends, from, to).map((bucket) => ({
    x: bucket.x,
    y: bucket.sends.length,
  }));
}

/**
 * One figure's own value for each day of the window, the trend a KPI's
 * sparkline draws. A day the figure cannot be stated on (a rate without
 * deliveries) is left out rather than drawn as a fall to zero.
 */
export function dailyValues(
  sends: SendSummary[],
  range: DateRange,
  extract: TotalsExtractor,
): number[] {
  return dailyBuckets(sends, range.from, range.to)
    .map((bucket) => extract(aggregate(bucket.sends)))
    .filter((value): value is number => value !== null);
}

/**
 * Lays a comparison series on the current one's axis, day 1 on day 1, so the
 * two periods overlap instead of standing side by side.
 */
export function alignSeries(
  points: SeriesPoint[],
  axis: SeriesPoint[],
): SeriesPoint[] {
  return points.slice(0, axis.length).map((point, index) => ({
    x: axis[index].x,
    y: point.y,
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
