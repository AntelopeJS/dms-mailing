import { expect } from "chai";
import type { MailingTemplate, SendSummary } from "../../db";
import {
  MIN_RANKED_DELIVERIES,
  comparedSteps,
  funnelSteps,
  rowDelta,
  toDomainItem,
  toTemplateItem,
  totalsBy,
} from "../../routes/metrics";
import { aggregate } from "../../services/metrics";

const send = (
  status: SendSummary["status"],
  extra: Partial<SendSummary> = {},
): SendSummary =>
  ({
    status,
    templateSlug: "welcome",
    recipientEmail: "a@gmail.com",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    opens: status === "opened" ? 1 : 0,
    clicks: 0,
    latencyMs: 0,
    ...extra,
  }) as SendSummary;

/** `count` deliveries of which `opened` were opened. */
const delivered = (count: number, opened: number): SendSummary[] =>
  Array.from({ length: count }, (_, index) =>
    send(index < opened ? "opened" : "delivered"),
  );

const OPEN_RATE = {
  extract: (totals: ReturnType<typeof aggregate>) => totals.openRate,
  minDeliveries: MIN_RANKED_DELIVERIES,
};

const templates = [
  { _id: "t1", slug: "welcome", name: "Welcome" },
] as MailingTemplate[];

describe("[unit] overview rankings against the comparison window", () => {
  it("gives a template its change in open rate", () => {
    const item = toTemplateItem(
      "welcome",
      aggregate(delivered(10, 6)),
      templates,
      OPEN_RATE,
      aggregate(delivered(10, 4)),
    );
    expect(item).to.deep.include({ value: 60, delta: 50 });
  });

  it("gives a domain its change in open rate", () => {
    const item = toDomainItem(
      "gmail.com",
      aggregate(delivered(10, 3)),
      aggregate(delivered(10, 6)),
    );
    expect(item).to.deep.include({ value: 30, delta: -50 });
  });

  it("states no change with the comparison off", () => {
    const item = toDomainItem("gmail.com", aggregate(delivered(10, 3)));
    expect(item).to.not.have.property("delta");
  });

  it("states no change against a row the window could not rank", () => {
    const thin = aggregate(delivered(MIN_RANKED_DELIVERIES - 1, 1));
    expect(rowDelta(30, thin, OPEN_RATE)).to.equal(null);
    expect(rowDelta(30, undefined, OPEN_RATE)).to.equal(null);
    const item = toTemplateItem(
      "welcome",
      aggregate(delivered(10, 3)),
      templates,
      OPEN_RATE,
      thin,
    );
    expect(item).to.not.have.property("delta");
  });

  it("states no change against a window nobody opened in", () => {
    expect(rowDelta(30, aggregate(delivered(10, 0)), OPEN_RATE)).to.equal(null);
  });

  it("totals the window's sends per row key", () => {
    const totals = totalsBy(
      [
        ...delivered(2, 1),
        send("delivered", { recipientEmail: "b@outlook.com" }),
      ],
      (row) => row.recipientEmail.split("@")[1] ?? "",
    );
    expect(totals.get("gmail.com")?.delivered).to.equal(2);
    expect(totals.get("outlook.com")?.delivered).to.equal(1);
  });
});

describe("[unit] overview funnel against the comparison window", () => {
  it("gives each step its compared count and change", () => {
    const steps = comparedSteps(
      funnelSteps(aggregate(delivered(6, 3)), false),
      funnelSteps(aggregate(delivered(4, 2)), false),
    );
    const sent = steps.find((step) => step.id === "sent");
    expect(sent).to.deep.include({ count: 6, previousCount: 4, delta: 50 });
    const opened = steps.find((step) => step.id === "opened");
    expect(opened).to.deep.include({ previousCount: 2, delta: 50 });
  });

  it("states the compared count but no change from zero", () => {
    const steps = comparedSteps(
      funnelSteps(aggregate(delivered(4, 1)), false),
      funnelSteps(aggregate(delivered(4, 0)), false),
    );
    const opened = steps.find((step) => step.id === "opened");
    expect(opened).to.deep.include({ previousCount: 0 });
    expect(opened).to.not.have.property("delta");
  });

  it("compares no step either window does not measure", () => {
    const steps = comparedSteps(
      funnelSteps(aggregate(delivered(4, 1)), false),
      funnelSteps(aggregate([send("sent")]), true),
    );
    const byId = (id: string) => steps.find((step) => step.id === id);
    expect(byId("sent")).to.have.property("previousCount", 1);
    expect(byId("delivered")).to.not.have.property("previousCount");
    expect(byId("opened")).to.not.have.property("delta");
  });
});
