import { expect } from "chai";
import type { MailingSend } from "../../db";
import {
  aggregate,
  dailySeries,
  deltaPercent,
  domainOf,
  forAudience,
  readAudience,
} from "../../services/metrics";

const LATENCY_MS = 100;
const YEAR = 2026;
const MONTH = 8;

const send = (
  status: MailingSend["status"],
  email: string,
  day: number,
  opens = 0,
  clicks = 0,
): MailingSend =>
  ({
    status,
    recipientEmail: email,
    createdAt: new Date(Date.UTC(YEAR, MONTH, day)),
    opens,
    clicks,
    latencyMs: LATENCY_MS,
  }) as MailingSend;

const SENDS = [
  send("delivered", "a@gmail.com", 1, 1),
  send("opened", "b@gmail.com", 1, 1, 0),
  send("clicked", "c@outlook.com", 2, 2, 1),
  send("bounced", "d@bad.tld", 2),
  send("failed", "e@gmail.com", 3),
];

const TOLERANCE = 0.01;
const EXPECTED_DELIVERABILITY = 60;
const EXPECTED_OPEN_RATE = 66.67;
const EXPECTED_DELTA = 20;

describe("[unit] services/metrics", () => {
  it("aggregates the funnel counters", () => {
    const totals = aggregate(SENDS);
    expect(totals).to.deep.include({
      sends: 5,
      delivered: 3,
      opened: 2,
      clicked: 1,
      bounced: 1,
      failed: 1,
      unsubscribed: 0,
      queued: 0,
    });
    expect(totals.deliverability).to.be.closeTo(
      EXPECTED_DELIVERABILITY,
      TOLERANCE,
    );
    expect(totals.openRate).to.be.closeTo(EXPECTED_OPEN_RATE, TOLERANCE);
  });

  it("computes deltas and daily series", () => {
    expect(deltaPercent(120, LATENCY_MS)).to.equal(EXPECTED_DELTA);
    expect(deltaPercent(5, 0)).to.equal(0);
    expect(
      dailySeries(
        SENDS,
        new Date(Date.UTC(YEAR, MONTH, 1)),
        new Date(Date.UTC(YEAR, MONTH, 4)),
      ).map((point) => point.y),
    ).to.deep.equal([2, 2, 1]);
    expect(domainOf("x@Gmail.com")).to.equal("gmail.com");
  });
});

const testSend = (): MailingSend =>
  ({
    status: "sent",
    recipientEmail: "t@gmail.com",
    createdAt: new Date(Date.UTC(YEAR, MONTH, 1)),
    opens: 0,
    clicks: 0,
    latencyMs: LATENCY_MS,
    isTest: true,
  }) as MailingSend;

const MIXED = [...SENDS, testSend()];

describe("[unit] services/metrics audience", () => {
  it("reads the audience from the query, defaulting to the business view", () => {
    expect(readAudience("operational")).to.equal("operational");
    expect(readAudience("business")).to.equal("business");
    expect(readAudience(null)).to.equal("business");
    expect(readAudience("nonsense")).to.equal("business");
  });

  it("hides test sends from the business view", () => {
    expect(forAudience(MIXED, "business")).to.have.lengthOf(SENDS.length);
    expect(aggregate(forAudience(MIXED, "business")).sends).to.equal(
      SENDS.length,
    );
  });

  it("counts every send in the operational view", () => {
    expect(forAudience(MIXED, "operational")).to.have.lengthOf(MIXED.length);
    expect(aggregate(forAudience(MIXED, "operational")).sends).to.equal(
      MIXED.length,
    );
  });
});

// The DMS period selector sends local day boundaries: for a UTC+2 tenant,
// "last 7 days" arrives as 2026-09-03T22:00Z → 2026-09-10T21:59:59.999Z.
const WINDOW_FROM = new Date("2026-09-03T22:00:00.000Z");
const WINDOW_TO = new Date("2026-09-10T21:59:59.999Z");
const DAYS_IN_WINDOW = 7;

const sentAt = (iso: string): MailingSend =>
  ({
    status: "sent",
    recipientEmail: "a@gmail.com",
    createdAt: new Date(iso),
    opens: 0,
    clicks: 0,
    latencyMs: LATENCY_MS,
  }) as MailingSend;

describe("[unit] services/metrics daily series over a DMS period", () => {
  it("covers every day of the window, last one included", () => {
    const points = dailySeries([], WINDOW_FROM, WINDOW_TO);
    expect(points).to.have.lengthOf(DAYS_IN_WINDOW);
    expect(points[0]?.x).to.equal("2026-09-04");
    expect(points[points.length - 1]?.x).to.equal("2026-09-10");
  });

  // The KPI counts this send through `aggregate`; the chart must agree.
  it("counts a send made on the last day of the window", () => {
    const points = dailySeries(
      [sentAt("2026-09-10T12:30:00.000Z")],
      WINDOW_FROM,
      WINDOW_TO,
    );
    expect(points.find((point) => point.x === "2026-09-10")?.y).to.equal(1);
    expect(points.reduce((total, point) => total + point.y, 0)).to.equal(1);
  });

  // Boundaries are local, keys must follow them: a send just after local
  // midnight belongs to the local day that just started, not the UTC one that
  // is still running.
  it("buckets a send by the local day the window is cut on", () => {
    const points = dailySeries(
      [sentAt("2026-09-06T22:30:00.000Z")],
      WINDOW_FROM,
      WINDOW_TO,
    );
    expect(points.find((point) => point.x === "2026-09-07")?.y).to.equal(1);
  });

  it("ignores a send outside the window rather than folding it into an edge", () => {
    const points = dailySeries(
      [sentAt("2026-09-03T10:00:00.000Z"), sentAt("2026-09-11T10:00:00.000Z")],
      WINDOW_FROM,
      WINDOW_TO,
    );
    expect(points.reduce((total, point) => total + point.y, 0)).to.equal(0);
  });
});
