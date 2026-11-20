import { MAX_WINDOW_DAYS } from "../constants";
import type { DateRange } from "./metrics";

export const DAY_MS = 86_400_000;

/**
 * Every window is read from the send log in full, so none may exceed the cap.
 * Bounds given the wrong way round are swapped: a reversed window is a typo,
 * not a request for a comparison in the future.
 */
export function boundedWindow(first: Date, second: Date): DateRange {
  const [requested, to] =
    first.getTime() <= second.getTime() ? [first, second] : [second, first];
  const earliest = to.getTime() - MAX_WINDOW_DAYS * DAY_MS;
  const from = requested.getTime() < earliest ? new Date(earliest) : requested;
  return { from, to };
}

/** The window of the same length just before `range`. */
export function previousWindow(range: DateRange): DateRange {
  const span = range.to.getTime() - range.from.getTime();
  return {
    from: new Date(range.from.getTime() - span),
    to: new Date(range.from.getTime()),
  };
}
