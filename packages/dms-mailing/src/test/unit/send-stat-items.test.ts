import { expect } from "chai";
import type { ComposedText } from "@antelopejs/interface-dms/base/types";
import {
  buildSendStatItems,
  latencyText,
} from "../../services/send-stat-items";
import type { SendStats } from "../../services/send-stats";

const STATS: SendStats = {
  sends: 20,
  sendsDelta: 25,
  tests: 2,
  delivered: 18,
  deliverability: 90,
  isDeliveryUntracked: false,
  problems: 2,
  bounced: 1,
  failed: 0,
  spam: 1,
  queued: 1,
  oldestQueuedAt: "2026-10-09T10:00:00.000Z",
  latencyMedian: 47,
  compared: { sends: 16, deliverability: 100, problems: 2, latencyMedian: 94 },
};

const NOW = new Date("2026-10-09T10:30:00.000Z").getTime();

describe("[unit] services/send-stat-items", () => {
  const items = buildSendStatItems(STATS, "Brevo", NOW);
  const byId = (id: string) => items.find((item) => item.id === id);

  it("builds the five cells of the strip in order", () => {
    expect(items.map((item) => item.id)).to.deep.equal([
      "sends",
      "delivered",
      "problems",
      "queued",
      "latency",
    ]);
  });

  it("composes the change and the compared figure with the tests left out", () => {
    expect(byId("sends")?.detail).to.deep.equal({
      key: "$dms_mailing.sends.stats.joined",
      params: {
        left: {
          key: "$dms_mailing.sends.stats.delta_up_versus",
          params: {
            delta: { type: "number", value: 0.25, format: "percent" },
            previous: 16,
          },
        },
        right: {
          key: "$dms_mailing.sends.stats.tests_excluded",
          params: { count: { type: "count", value: 2 } },
        },
      },
    });
  });

  it("compares the deliverability, the problems and the latency", () => {
    /** The first text of a detail: "joined" folds its parts from the left. */
    const first = (text: ComposedText): ComposedText =>
      text.key.endsWith(".joined")
        ? first(text.params?.left as ComposedText)
        : text;
    const left = (id: string) => first(byId(id)?.detail as ComposedText);
    expect(left("delivered")).to.deep.equal({
      key: "$dms_mailing.sends.stats.delta_down_versus",
      params: {
        delta: { type: "number", value: 0.1, format: "percent" },
        previous: { type: "number", value: 1, format: "percent" },
      },
    });
    expect(left("problems")).to.deep.equal({
      key: "$dms_mailing.sends.stats.versus",
      params: { previous: 2 },
    });
    expect(left("latency")).to.deep.equal({
      key: "$dms_mailing.sends.stats.delta_down_versus",
      params: {
        delta: { type: "number", value: 0.5, format: "percent" },
        previous: latencyText(94),
      },
    });
  });

  it("never compares the queue, which is what waits now", () => {
    expect(JSON.stringify(byId("queued")?.detail)).to.not.contain("versus");
  });

  it("states no comparison at all with the comparison turned off", () => {
    const plain = buildSendStatItems(
      { ...STATS, sendsDelta: null, compared: null },
      "Brevo",
      NOW,
    );
    expect(JSON.stringify(plain)).to.not.contain("versus");
    expect(plain.find((item) => item.id === "delivered")?.detail).to.deep.equal(
      {
        key: "$dms_mailing.sends.stats.delivered_of",
        params: { delivered: 18, sends: 20 },
      },
    );
  });

  it("states no change of a rate the compared window could not measure", () => {
    const unmeasured = buildSendStatItems(
      {
        ...STATS,
        compared: {
          sends: 16,
          deliverability: null,
          problems: 2,
          latencyMedian: 94,
        },
      },
      "Brevo",
      NOW,
    );
    const delivered = unmeasured.find((item) => item.id === "delivered");
    expect(JSON.stringify(delivered?.detail)).to.not.contain("versus");
  });

  it("links the problems and lists only the kinds that happened", () => {
    const problems = byId("problems");
    expect(problems?.tone).to.equal("error");
    expect(problems?.to).to.equal("/modules/mailing/sends?view=problems");
    expect(JSON.stringify(problems?.detail)).to.contain("breakdown.bounced");
    expect(JSON.stringify(problems?.detail)).to.not.contain("breakdown.failed");
  });

  it("warns when the oldest queued send waits too long", () => {
    expect(byId("queued")?.detailTone).to.equal("warning");
    const fresh = buildSendStatItems(STATS, "Brevo", NOW - 25 * 60_000);
    expect(fresh.find((item) => item.id === "queued")?.detailTone).to.equal(
      undefined,
    );
  });

  it("names the provider and switches latency to seconds past 5 s", () => {
    expect(JSON.stringify(byId("latency")?.detail)).to.contain("Brevo");
    expect(latencyText(6500)).to.deep.equal({
      key: "$dms_mailing.sends.stats.latency_s",
      params: { value: { type: "number", value: 6.5, format: "decimal" } },
    });
  });

  it("says the provider tracks no delivery rather than a 0 %", () => {
    const untracked = buildSendStatItems(
      { ...STATS, isDeliveryUntracked: true },
      "nodemailer",
      NOW,
    );
    const delivered = untracked.find((item) => item.id === "delivered");
    expect(delivered?.value).to.equal("—");
    expect(delivered?.detail).to.deep.equal({
      key: "$dms_mailing.sends.stats.not_tracked",
      params: { provider: "nodemailer" },
    });
  });

  it("answers an empty strip with dashes and quiet details", () => {
    const empty = buildSendStatItems(
      {
        ...STATS,
        sends: 0,
        problems: 0,
        bounced: 0,
        spam: 0,
        tests: 0,
        sendsDelta: 0,
        compared: null,
        queued: 0,
        oldestQueuedAt: null,
      },
      "",
      NOW,
    );
    expect(empty.find((item) => item.id === "delivered")?.value).to.equal("—");
    expect(empty.find((item) => item.id === "problems")?.detail).to.deep.equal({
      key: "$dms_mailing.sends.stats.no_problems",
    });
  });
});
