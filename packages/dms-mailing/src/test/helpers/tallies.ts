import type { SendSummary, SendTally } from "../../db";
import {
  aggregate,
  dailySeries,
  dailyValues,
  dayIndex,
  type DateRange,
  isDeliveryUntracked,
  leftForProvider,
  type ProviderTracking,
  type SeriesPoint,
  tallySends,
  type Totals,
  type TotalsExtractor,
} from "../../services/metrics";
import type { SendWindow } from "../../services/send-stats";

/** Sends tallied per day of `range`, as the database tallies a window. */
export const tallyByDay = (
  sends: SendSummary[],
  range: DateRange,
): SendTally[] => tallySends(sends, (send) => dayIndex(send.createdAt, range));

/** Sends tallied per template, as the database tallies them. */
export const tallyByTemplate = (sends: SendSummary[]): SendTally[] =>
  tallySends(sends, (send) => send.templateSlug);

/** Sends tallied per source, as the database tallies a template's sends. */
export const tallyBySource = (sends: SendSummary[]): SendTally[] =>
  tallySends(sends, (send) => send.source ?? "");

/** A period as the send log's strip reads it from the database. */
export const windowOf = (sends: SendSummary[]): SendWindow => ({
  tallies: tallySends(sends),
  latencies: sends.filter((send) => !send.isTest && leftForProvider(send)),
});

export const totalsOf = (sends: SendSummary[]): Totals =>
  aggregate(tallySends(sends));

export const isUntracked = (
  sends: SendSummary[],
  tracking: ProviderTracking | null,
): boolean => isDeliveryUntracked(tallySends(sends), tracking);

export const seriesOf = (
  sends: SendSummary[],
  from: Date,
  to: Date,
): SeriesPoint[] => dailySeries(tallyByDay(sends, { from, to }), { from, to });

export const valuesOf = (
  sends: SendSummary[],
  range: DateRange,
  extract: TotalsExtractor,
): number[] => dailyValues(tallyByDay(sends, range), range, extract);
