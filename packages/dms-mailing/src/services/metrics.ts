import type { SendSummary, SendTally, SendTraits, TallyKey } from "../db";
import {
  BUSINESS_AUDIENCE,
  isResolvedStage,
  OPERATIONAL_AUDIENCE,
  type SendAudience,
  type SendStatus,
} from "../types";

const LEAVES_OUT_TESTS: Record<SendAudience, boolean> = {
  [BUSINESS_AUDIENCE]: true,
  [OPERATIONAL_AUDIENCE]: false,
};

const isAudience = (raw: string): raw is SendAudience =>
  Object.hasOwn(LEAVES_OUT_TESTS, raw);

/** Named audience behind a query value; anything unknown is the business view. */
export function readAudience(raw: string | null | undefined): SendAudience {
  return raw != null && isAudience(raw) ? raw : BUSINESS_AUDIENCE;
}

const STATS_WINDOW_DAYS = 30;

/** Where the per-template figures start: the last 30 days. */
export function statsWindowStart(now: number = Date.now()): Date {
  return new Date(now - STATS_WINDOW_DAYS * DAY_MS);
}

/** The sends `audience` describes, out of a window read whole. */
export function forAudience(
  sends: SendSummary[],
  audience: SendAudience,
): SendSummary[] {
  return leavesOutTests(audience)
    ? sends.filter((send) => !send.isTest)
    : sends;
}

/** Whether `audience` leaves the test sends out of its figures. */
export function leavesOutTests(audience: SendAudience): boolean {
  return LEAVES_OUT_TESTS[audience];
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

/** How many sends the tallies count, those `predicate` keeps. */
export const countOf = (
  tallies: SendTally[],
  predicate: (tally: SendTally) => boolean = () => true,
): number =>
  tallies.reduce(
    (total, tally) => (predicate(tally) ? total + tally.count : total),
    0,
  );

const byStatus =
  (status: SendStatus) =>
  (send: SendTraits): boolean =>
    send.status === status;

const isDelivered = (send: SendTraits): boolean =>
  DELIVERED_LIKE.includes(send.status);

/**
 * Engagement outlives the final status: a send opened, clicked and then
 * unsubscribed (or reported as spam) was still opened and clicked, and a
 * click implies an open the pixel may have missed.
 */
const wasClicked = (send: SendTraits): boolean =>
  isDelivered(send) && (send.status === "clicked" || send.hasClicks);

const wasOpened = (send: SendTraits): boolean =>
  isDelivered(send) && (OPENED_LIKE.includes(send.status) || send.hasOpens);

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

/** A send to a suppressed address never left: no figure counts it. */
export const leftForProvider = (send: Pick<SendTraits, "status">): boolean =>
  send.status !== "suppressed";

/** The latency median of the sends that left for the provider. */
export const latencyMedian = (sends: Array<Pick<SendSummary, "latencyMs">>) =>
  median(sends.flatMap((send) => send.latencyMs ?? []));

export function aggregate(logged: SendTally[]): Totals {
  const sends = logged.filter(leftForProvider);
  const total = countOf(sends);
  const delivered = countOf(sends, isDelivered);
  const opened = countOf(sends, wasOpened);
  const clicked = countOf(sends, wasClicked);
  return {
    sends: total,
    queued: countOf(sends, byStatus("queued")),
    sent: countOf(sends, byStatus("sent")),
    delivered,
    opened,
    clicked,
    bounced: countOf(sends, byStatus("bounced")),
    failed: countOf(sends, byStatus("failed")),
    spam: countOf(sends, byStatus("spam")),
    unsubscribed: countOf(sends, byStatus("unsubscribed")),
    deliverability: ratio(delivered, total),
    openRate: ratio(opened, delivered),
    clickRate: ratio(clicked, delivered),
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

const showsProviderEvent = (send: SendTraits): boolean =>
  PROVIDER_EVENT_STATUSES.includes(send.status) || send.hasOpens;

/**
 * Whether the window's delivery figures are unmeasured: the provider tracks
 * nothing itself (SMTP) and no event came back by webhook either, so every
 * send stays "sent" and a 0 % deliverability would be a false alarm. Unknown
 * capabilities (the provider unreachable) claim nothing.
 */
export function isDeliveryUntracked(
  sends: SendTally[],
  tracking: ProviderTracking | null,
): boolean {
  if (!tracking || tracking.openTracking || tracking.clickTracking)
    return false;
  return countOf(sends) > 0 && !sends.some(showsProviderEvent);
}

const dayKey = (date: Date): string =>
  date.toISOString().slice(0, DAY_KEY_LENGTH);

interface DayBucket<Item> {
  x: string;
  items: Item[];
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
function dailyBuckets<Item>(
  items: Item[],
  dayOf: (item: Item) => TallyKey,
  range: DateRange,
): Array<DayBucket<Item>> {
  const start = range.from.getTime();
  const dayCount = Math.max(
    1,
    Math.ceil((range.to.getTime() - start) / DAY_MS),
  );
  const buckets = Array.from({ length: dayCount }, (_, index) => ({
    x: dayKey(new Date(start + index * DAY_MS + DAY_MS / 2)),
    items: new Array<Item>(),
  }));
  for (const item of items) {
    const day = Number(dayOf(item));
    if (day >= 0) buckets[day]?.items.push(item);
  }
  return buckets;
}

/** The day of the window a send was made on, counted from its start. */
export const dayIndex = (at: Date, range: DateRange): number =>
  Math.floor((new Date(at).getTime() - range.from.getTime()) / DAY_MS);

/** The number of sends of each day of the window, from tallies per day. */
export function dailySeries(
  sends: SendTally[],
  range: DateRange,
): SeriesPoint[] {
  return dailyBuckets(sends, (tally) => tally.key, range).map((bucket) => ({
    x: bucket.x,
    y: countOf(bucket.items),
  }));
}

/**
 * One figure's own value for each day of the window, the trend a KPI's
 * sparkline draws. A day the figure cannot be stated on (a rate without
 * deliveries) is left out rather than drawn as a fall to zero.
 */
export function dailyValues(
  sends: SendTally[],
  range: DateRange,
  extract: TotalsExtractor,
): number[] {
  return dailyBuckets(sends, (tally) => tally.key, range)
    .map((bucket) => extract(aggregate(bucket.items)))
    .filter((value): value is number => value !== null);
}

/** The latency median of each day of the window, the latency sparkline. */
export function dailyLatencies(
  sends: Array<Pick<SendSummary, "createdAt" | "latencyMs">>,
  range: DateRange,
): number[] {
  return dailyBuckets(
    sends,
    (send) => dayIndex(send.createdAt, range),
    range,
  ).map((bucket) => latencyMedian(bucket.items));
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

/** The tallies of sends read in memory, the way the database counts them. */
export function tallySends(
  sends: SendSummary[],
  keyOf: (send: SendSummary) => TallyKey = () => "",
): SendTally[] {
  const tallies = new Map<string, SendTally>();
  for (const send of sends) {
    const at = new Date(send.createdAt).getTime();
    const traits: SendTraits = {
      key: keyOf(send),
      status: send.status,
      hasOpens: send.opens > 0 || send.clicks > 0,
      hasClicks: send.clicks > 0,
      isTest: send.isTest === true,
      isResolved: isResolvedStage(send.stage),
    };
    const id = JSON.stringify(traits);
    const tally = tallies.get(id);
    if (tally) {
      tally.count += 1;
      tally.firstAtMs = Math.min(tally.firstAtMs, at);
      tally.lastAtMs = Math.max(tally.lastAtMs, at);
    } else
      tallies.set(id, { ...traits, count: 1, firstAtMs: at, lastAtMs: at });
  }
  return [...tallies.values()];
}

/**
 * The tallies of each group, groups in the order of their earliest send: the
 * order a read of the sends in the order they were made meets them.
 */
export function tallyGroups(tallies: SendTally[]): Map<TallyKey, SendTally[]> {
  const byFirstSend = [...tallies].sort(
    (left, right) => left.firstAtMs - right.firstAtMs,
  );
  return groupBy(byFirstSend, (tally) => tally.key);
}

export function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

export function groupBy<T, Key = string>(
  items: T[],
  key: (item: T) => Key,
): Map<Key, T[]> {
  const groups = new Map<Key, T[]>();
  for (const item of items) {
    const id = key(item);
    const group = groups.get(id);
    if (group) group.push(item);
    else groups.set(id, [item]);
  }
  return groups;
}
