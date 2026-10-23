import type { RequestContext } from "@antelopejs/interface-api";
import { MAX_WINDOW_DAYS } from "../constants";
import type { DateRange } from "../services/metrics";

/**
 * Both readers only ever touch the query string, so they ask for that slice
 * rather than the whole request: a full `RequestContext` still satisfies it.
 */
export type RangeContext = Pick<RequestContext, "url">;

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 30;
/** The DMS period selector's `comparison` value when the user turned it off. */
const NO_COMPARISON = "none";
const PREVIOUS_YEAR = "previous-year";

/**
 * What the comparison series is called, by the selector's `comparison`. A
 * custom window, or a caller naming none, is neither of the two.
 */
const COMPARISON_SERIES_LABELS: Record<string, string> = {
  "previous-period": "$dms_mailing.metrics.previous",
  [PREVIOUS_YEAR]: "$dms_mailing.metrics.previous_year",
};
const COMPARED_SERIES_LABEL = "$dms_mailing.metrics.compared";

function readQuery(ctx: RangeContext, key: string): string | undefined {
  return ctx.url.searchParams.get(key) ?? undefined;
}

function parseDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Every window is read from the send log in full, so none may exceed the cap.
 * Bounds given the wrong way round are swapped: a reversed window is a typo,
 * not a request for a comparison in the future.
 */
function boundedWindow(first: Date, second: Date): DateRange {
  const [requested, to] =
    first.getTime() <= second.getTime() ? [first, second] : [second, first];
  const earliest = to.getTime() - MAX_WINDOW_DAYS * DAY_MS;
  const from = requested.getTime() < earliest ? new Date(earliest) : requested;
  return { from, to };
}

export function currentRange(ctx: RangeContext): DateRange {
  const to = parseDate(readQuery(ctx, "to")) ?? new Date();
  const requested =
    parseDate(readQuery(ctx, "from")) ??
    new Date(to.getTime() - DEFAULT_WINDOW_DAYS * DAY_MS);
  return boundedWindow(requested, to);
}

/**
 * Whether the caller compares the window with another one. The DMS period
 * selector says `comparison=none` when the user turned it off; a caller that
 * says nothing keeps the previous period.
 */
export function isComparisonWanted(ctx: RangeContext): boolean {
  return readQuery(ctx, "comparison") !== NO_COMPARISON;
}

/** The label of the comparison series, for the comparison the caller asks. */
export function comparisonLabel(ctx: RangeContext): string {
  const comparison = readQuery(ctx, "comparison") ?? "previous-period";
  return COMPARISON_SERIES_LABELS[comparison] ?? COMPARED_SERIES_LABEL;
}

function yearBefore(date: Date): Date {
  const shifted = new Date(date.getTime());
  shifted.setUTCFullYear(shifted.getUTCFullYear() - 1);
  return shifted;
}

/**
 * The window the current one is compared with. The DMS selector resolves it
 * itself and sends `compareFrom` / `compareTo`, for the previous year as for
 * the previous period; a caller sending only `comparison` gets the same
 * window a year back, or the equal-length span just before.
 */
export function comparisonRange(
  ctx: RangeContext,
  current: DateRange,
): DateRange {
  const from = parseDate(readQuery(ctx, "compareFrom"));
  const to = parseDate(readQuery(ctx, "compareTo"));
  if (from && to) return boundedWindow(from, to);
  if (readQuery(ctx, "comparison") === PREVIOUS_YEAR) {
    return { from: yearBefore(current.from), to: yearBefore(current.to) };
  }
  const span = current.to.getTime() - current.from.getTime();
  return {
    from: new Date(current.from.getTime() - span),
    to: new Date(current.from.getTime()),
  };
}
