import { expect } from "chai";
import type { SendSummary } from "../../db";
import { summaryRow } from "../helpers/rows";
import {
  buildSendStats,
  isProviderFailure,
  isTransportFailure,
} from "../../services/send-stats";
import { aggregate } from "../../services/metrics";
import type { SendStatus } from "../../types";

const send = (
  status: SendStatus,
  extra: Partial<SendSummary> = {},
): SendSummary =>
  summaryRow({
    status,
    isTest: false,
    latencyMs: 200,
    createdAt: new Date("2026-10-01T10:00:00Z"),
    ...extra,
  });

describe("[unit] services/send-stats", () => {
  it("counts real sends, keeps tests aside and breaks problems down", () => {
    const stats = buildSendStats(
      [
        send("delivered"),
        send("opened"),
        send("bounced"),
        send("failed"),
        send("spam"),
        send("delivered", { isTest: true }),
      ],
      [send("delivered"), send("delivered"), send("delivered"), send("sent")],
    );
    expect(stats).to.deep.include({
      sends: 5,
      tests: 1,
      problems: 3,
      bounced: 1,
      failed: 1,
      spam: 1,
      sendsDelta: 25,
    });
  });

  it("leaves out of the problems those someone already sent again", () => {
    const stats = buildSendStats(
      [
        send("failed"),
        send("failed", { stage: "resolved" }),
        send("bounced", { stage: "resolved" }),
        send("spam", { stage: "problem" }),
      ],
      [],
    );
    expect(stats).to.deep.include({
      problems: 2,
      bounced: 0,
      failed: 1,
      spam: 1,
    });
  });

  it("states no delta when the comparison is turned off", () => {
    const stats = buildSendStats([send("delivered")], null);
    expect(stats.sendsDelta).to.equal(null);
    expect(stats.compared).to.equal(null);
  });

  it("reads the compared figures of the window, tests left out", () => {
    const stats = buildSendStats(
      [send("delivered")],
      [
        send("delivered", { latencyMs: 100 }),
        send("bounced", { latencyMs: 300 }),
        send("failed", { stage: "resolved", latencyMs: 300 }),
        send("spam", { isTest: true }),
      ],
    );
    expect(stats.compared).to.deep.equal({
      sends: 3,
      deliverability: aggregate([
        send("delivered"),
        send("bounced"),
        send("failed"),
      ]).deliverability,
      problems: 1,
      latencyMedian: 300,
    });
  });

  it("states no compared rate or latency for an empty window", () => {
    expect(buildSendStats([send("delivered")], []).compared).to.deep.equal({
      sends: 0,
      deliverability: null,
      problems: 0,
      latencyMedian: null,
    });
  });

  it("dates the oldest send still queued", () => {
    const stats = buildSendStats(
      [
        send("queued", { createdAt: new Date("2026-10-01T10:05:00Z") }),
        send("queued", { createdAt: new Date("2026-10-01T10:01:00Z") }),
      ],
      [],
    );
    expect(stats.queued).to.equal(2);
    expect(stats.oldestQueuedAt).to.equal("2026-10-01T10:01:00.000Z");
  });

  it("has no oldest queued send when nothing waits", () => {
    expect(buildSendStats([send("sent")], []).oldestQueuedAt).to.equal(null);
  });

  it("treats only real provider failures as worth a send again", () => {
    expect(isProviderFailure(send("failed"))).to.equal(true);
    expect(isProviderFailure(send("bounced"))).to.equal(false);
    expect(isProviderFailure(send("failed", { isTest: true }))).to.equal(false);
  });

  it("never offers again a failure someone already sent again", () => {
    expect(isProviderFailure(send("failed", { stage: "resolved" }))).to.equal(
      false,
    );
  });

  it("tells a connection failure from a recipient's rejection", () => {
    expect(
      isTransportFailure(send("failed", { error: "connect ECONNREFUSED" })),
    ).to.equal(true);
    expect(
      isTransportFailure(send("failed", { error: "550 5.1.1 No such user" })),
    ).to.equal(false);
  });
});
