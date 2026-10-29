import type { RequestContext } from "@antelopejs/interface-api";
import { expect } from "chai";
import { MAX_WINDOW_DAYS } from "../../constants";
import {
  comparisonLabel,
  comparisonRange,
  currentRange,
  isComparisonWanted,
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

  /**
   * `from` and `to` are plain query parameters. Without a ceiling a caller can
   * ask for centuries, and every daily series then allocates one bucket per
   * day.
   */
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

  /**
   * A reversed window is a typo: read as given, the comparison window would
   * land in the future.
   */
  it("swaps the bounds of a reversed window", () => {
    const range = currentRange(
      ctxWith({
        from: "2026-09-11T00:00:00.000Z",
        to: "2026-09-04T00:00:00.000Z",
      }),
    );
    expect(range.from.toISOString()).to.equal("2026-09-04T00:00:00.000Z");
    expect(range.to.toISOString()).to.equal("2026-09-11T00:00:00.000Z");
    const previous = comparisonRange(ctxWith({}), range);
    expect(previous.to.getTime()).to.equal(range.from.getTime());
  });

  it("swaps the bounds of a reversed comparison window", () => {
    const previous = comparisonRange(
      ctxWith({
        compareFrom: "2026-09-01T00:00:00.000Z",
        compareTo: "2026-08-01T00:00:00.000Z",
      }),
      currentRange(ctxWith({})),
    );
    expect(previous.from.toISOString()).to.equal("2026-08-01T00:00:00.000Z");
  });

  it("compares unless the selector turned the comparison off", () => {
    expect(isComparisonWanted(ctxWith({}))).to.equal(true);
    expect(
      isComparisonWanted(ctxWith({ comparison: "previous-period" })),
    ).to.equal(true);
    expect(isComparisonWanted(ctxWith({ comparison: "none" }))).to.equal(false);
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

  /**
   * `compareFrom`/`compareTo` are plain query parameters too, and every metric
   * reads its comparison window from the send log in full.
   */
  it("clamps an explicit comparison window like the current one", () => {
    const current = currentRange(ctxWith({}));
    const previous = comparisonRange(
      ctxWith({
        compareFrom: "1970-01-01T00:00:00.000Z",
        compareTo: "2026-09-01T00:00:00.000Z",
      }),
      current,
    );
    expect(spanDays(previous)).to.equal(MAX_WINDOW_DAYS);
    expect(previous.to.toISOString()).to.equal("2026-09-01T00:00:00.000Z");
  });

  it("keeps an explicit comparison window within the cap", () => {
    const current = currentRange(ctxWith({}));
    const previous = comparisonRange(
      ctxWith({
        compareFrom: "2026-08-01T00:00:00.000Z",
        compareTo: "2026-09-01T00:00:00.000Z",
      }),
      current,
    );
    expect(previous.from.toISOString()).to.equal("2026-08-01T00:00:00.000Z");
  });

  describe("each comparison the toolbar offers", () => {
    const WINDOW = {
      from: "2026-09-04T00:00:00.000Z",
      to: "2026-09-11T00:00:00.000Z",
    };
    const current = currentRange(ctxWith(WINDOW));

    it("takes the window the selector resolved, the previous year's too", () => {
      const previous = comparisonRange(
        ctxWith({
          ...WINDOW,
          comparison: "previous-year",
          compareFrom: "2025-09-04T00:00:00.000Z",
          compareTo: "2025-09-11T00:00:00.000Z",
        }),
        current,
      );
      expect(previous.from.toISOString()).to.equal("2025-09-04T00:00:00.000Z");
      expect(previous.to.toISOString()).to.equal("2025-09-11T00:00:00.000Z");
    });

    it("moves the window a year back when only the previous year is named", () => {
      const previous = comparisonRange(
        ctxWith({ ...WINDOW, comparison: "previous-year" }),
        current,
      );
      expect(previous.from.toISOString()).to.equal("2025-09-04T00:00:00.000Z");
      expect(previous.to.toISOString()).to.equal("2025-09-11T00:00:00.000Z");
    });

    it("takes the span just before when only the previous period is named", () => {
      const previous = comparisonRange(
        ctxWith({ ...WINDOW, comparison: "previous-period" }),
        current,
      );
      expect(previous.from.toISOString()).to.equal("2026-08-28T00:00:00.000Z");
      expect(previous.to.toISOString()).to.equal(WINDOW.from);
    });

    it("compares with nothing when the user picks none", () => {
      expect(isComparisonWanted(ctxWith({ comparison: "none" }))).to.equal(
        false,
      );
      expect(
        isComparisonWanted(ctxWith({ comparison: "previous-year" })),
      ).to.equal(true);
    });

    it("names the comparison series after the comparison", () => {
      expect(comparisonLabel(ctxWith({}))).to.equal(
        "$dms_mailing.metrics.previous",
      );
      expect(
        comparisonLabel(ctxWith({ comparison: "previous-period" })),
      ).to.equal("$dms_mailing.metrics.previous");
      expect(
        comparisonLabel(ctxWith({ comparison: "previous-year" })),
      ).to.equal("$dms_mailing.metrics.previous_year");
      expect(comparisonLabel(ctxWith({ comparison: "custom" }))).to.equal(
        "$dms_mailing.metrics.compared",
      );
    });
  });
});
