import { expect } from "chai";
import type { SendSummary } from "../../db";
import { buildSendStats, isProviderFailure } from "../../services/send-stats";
import type { SendStatus } from "../../types";

const send = (
  status: SendStatus,
  extra: Partial<SendSummary> = {},
): SendSummary =>
  ({
    status,
    isTest: false,
    latencyMs: 200,
    createdAt: new Date("2026-10-01T10:00:00Z"),
    ...extra,
  }) as SendSummary;

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
});
