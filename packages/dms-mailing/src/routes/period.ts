import type { RequestContext } from "@antelopejs/interface-api";

/**
 * Both readers only ever touch the query string, so they ask for that slice
 * rather than the whole request: a full `RequestContext` still satisfies it.
 */
export type RangeContext = Pick<RequestContext, "url">;
import { MAX_WINDOW_DAYS } from "../constants";
import type { DateRange } from "../services/metrics";

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 30;
/** The DMS period selector's `comparison` value when the user turned it off. */
const NO_COMPARISON = "none";

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

export function comparisonRange(
  ctx: RangeContext,
  current: DateRange,
): DateRange {
  const from = parseDate(readQuery(ctx, "compareFrom"));
  const to = parseDate(readQuery(ctx, "compareTo"));
  if (from && to) return boundedWindow(from, to);
  const span = current.to.getTime() - current.from.getTime();
  return {
    from: new Date(current.from.getTime() - span),
    to: new Date(current.from.getTime()),
  };
}
