import { expect } from "chai";
import type { SendSummary } from "../../db";
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
  ({
    status,
    isTest: false,
    locale: "en",
    requestedLocale: "en",
    createdAt: new Date("2026-10-01T10:00:00Z"),
    ...extra,
  }) as SendSummary;

describe("[unit] services/template-stats", () => {
  it("sums sends, open rate, problems and the last send", () => {
    const stats = performanceOf("t1", "welcome", [
      send("opened", { createdAt: new Date("2026-10-02T10:00:00Z") }),
      send("delivered"),
      send("bounced"),
    ]);
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
      sourcesOf([
        send("sent", { source: "billing" }),
        send("sent", { source: "checkout" }),
        send("sent", { source: "checkout" }),
      ]),
    ).to.deep.equal([
      { source: "checkout", count: 2 },
      { source: "billing", count: 1 },
    ]);
  });

  it("counts the recipients who got another locale than they asked", () => {
    expect(
      fallbacksOf([
        send("sent", { requestedLocale: "de", locale: "en" }),
        send("sent", { requestedLocale: "de", locale: "en" }),
        send("sent", { requestedLocale: "", locale: "en" }),
        send("sent"),
      ]),
    ).to.deep.equal([{ requested: "de", used: "en", count: 2 }]);
  });
});
