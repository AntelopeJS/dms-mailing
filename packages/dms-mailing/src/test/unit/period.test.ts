import type { RequestContext } from "@antelopejs/interface-api";
import { expect } from "chai";
import { MAX_WINDOW_DAYS } from "../../constants";
import {
  comparisonRange,
  currentRange,
  type RangeContext,
} from "../../routes/period";

const DAY_MS = 86_400_000;

const ctxWith = (query: Record<string, string>): RangeContext => ({
  url: { searchParams: new URLSearchParams(query) } as RequestContext["url"],
});

const spanDays = (range: { from: Date; to: Date }) =>
  (range.to.getTime() - range.from.getTime()) / DAY_MS;

describe("[unit] period range", () => {
  it("keeps a window the dashboard actually asks for", () => {
    const range = currentRange(
      ctxWith({
        from: "2026-09-04T00:00:00.000Z",
        to: "2026-09-11T00:00:00.000Z",
      }),
    );
    expect(spanDays(range)).to.equal(7);
  });

  // `from` and `to` are plain query parameters. Without a ceiling a caller can
  // ask for centuries, and every daily series then allocates one bucket per day.
  it("clamps an absurd window instead of allocating a bucket per day", () => {
    const range = currentRange(
      ctxWith({
        from: "1500-01-01T00:00:00.000Z",
        to: "2500-01-01T00:00:00.000Z",
      }),
    );
    expect(spanDays(range)).to.equal(MAX_WINDOW_DAYS);
    expect(range.to.toISOString()).to.equal("2500-01-01T00:00:00.000Z");
  });

  it("leaves a reversed window alone rather than inventing one", () => {
    const range = currentRange(
      ctxWith({
        from: "2026-09-11T00:00:00.000Z",
        to: "2026-09-04T00:00:00.000Z",
      }),
    );
    expect(spanDays(range)).to.be.lessThan(0);
  });

  it("derives the comparison window from the clamped current one", () => {
    const current = currentRange(
      ctxWith({
        from: "1500-01-01T00:00:00.000Z",
        to: "2500-01-01T00:00:00.000Z",
      }),
    );
    const previous = comparisonRange(ctxWith({}), current);
    expect(spanDays(previous)).to.equal(MAX_WINDOW_DAYS);
    expect(previous.to.getTime()).to.equal(current.from.getTime());
  });
});
