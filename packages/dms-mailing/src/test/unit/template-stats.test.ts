import { expect } from "chai";
import type { SendSummary } from "../../db";
import { summaryRow } from "../helpers/rows";
import { tallyBySource } from "../helpers/tallies";
import {
  fallbacksOf,
  performanceOf,
  sourcesOf,
} from "../../services/template-stats";
import type { SendStatus } from "../../types";

const send = (
  status: SendStatus,
  extra: Partial<SendSummary> = {},
): SendSummary =>
  summaryRow({
    status,
    isTest: false,
    locale: "en",
    requestedLocale: "en",
    createdAt: new Date("2026-10-01T10:00:00Z"),
    ...extra,
  });

describe("[unit] services/template-stats", () => {
  it("sums sends, open rate, problems and the last send", () => {
    const stats = performanceOf(
      "t1",
      "welcome",
      tallyBySource([
        send("opened", { createdAt: new Date("2026-10-02T10:00:00Z") }),
        send("delivered"),
        send("bounced"),
      ]),
      [],
    );
    expect(stats).to.deep.include({
      id: "t1",
      slug: "welcome",
      sends: 3,
      problems: 1,
      lastSentAt: "2026-10-02T10:00:00.000Z",
    });
    expect(stats.openRate).to.equal(50);
  });

  it("groups sends by source, busiest first", () => {
    expect(
      sourcesOf(
        tallyBySource([
          send("sent", { source: "billing" }),
          send("sent", { source: "checkout" }),
          send("sent", { source: "checkout" }),
        ]),
      ),
    ).to.deep.equal([
      { source: "checkout", count: 2 },
      { source: "billing", count: 1 },
    ]);
  });

  it("keeps a source tied on count after the one whose first send came first", () => {
    expect(
      sourcesOf(
        tallyBySource([
          send("sent", {
            source: "billing",
            createdAt: new Date("2026-10-01T09:00:00Z"),
          }),
          send("sent", { source: "checkout" }),
          send("sent", {
            source: "billing",
            createdAt: new Date("2026-10-01T11:00:00Z"),
          }),
          send("sent", { source: "checkout" }),
        ]),
      ).map((row) => row.source),
    ).to.deep.equal(["billing", "checkout"]);
  });

  it("lists the locale fallbacks in the order of their first send", () => {
    expect(
      fallbacksOf([
        { requested: "fr", used: "en", count: 1, firstAtMs: 20 },
        { requested: "de", used: "en", count: 2, firstAtMs: 10 },
      ]),
    ).to.deep.equal([
      { requested: "de", used: "en", count: 2 },
      { requested: "fr", used: "en", count: 1 },
    ]);
  });
});
