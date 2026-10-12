import { expect } from "chai";
import type { MailingTemplate, SendSummary } from "../../db";
import {
  MIN_RANKED_DELIVERIES,
  filterByKind,
  funnelSteps,
  isUnmeasured,
  kpiFigure,
  ranked,
  readFunnelKind,
  toDomainItem,
  toTemplateItem,
  volumeChart,
} from "../../routes/metrics";
import { nextRetentionRun } from "../../routes/settings";
import { missingLocaleTemplates } from "../../services/attention";
import { aggregate } from "../../services/metrics";

const template = (
  slug: string,
  locales: string,
  extra: Partial<MailingTemplate> = {},
): MailingTemplate =>
  ({ slug, name: slug, locales, status: "live", ...extra }) as MailingTemplate;

describe("[unit] overview helpers", () => {
  it("finds live templates missing a locale other live ones carry", () => {
    const missing = missingLocaleTemplates([
      template("a", "en,fr,de"),
      template("b", "en,fr"),
      template("c", "en", { status: "draft" }),
      template("d", ""),
    ]);
    expect(missing.map((row) => row.slug)).to.deep.equal(["b"]);
  });

  it("splits the funnel on the marketing category", () => {
    const templates = [
      template("promo", "en", { category: "marketing" }),
      template("receipt", "en", { category: "orders" }),
    ];
    const sends = [
      { templateSlug: "promo" },
      { templateSlug: "receipt" },
      { templateSlug: "gone" },
    ] as SendSummary[];
    expect(filterByKind(sends, templates, "marketing")).to.have.length(1);
    expect(filterByKind(sends, templates, "transactional")).to.have.length(2);
    expect(filterByKind(sends, templates, "all")).to.have.length(3);
    expect(readFunnelKind("nope")).to.equal("all");
  });

  it("schedules the next retention run at 03:15", () => {
    const evening = new Date(2026, 9, 7, 21, 0);
    const night = nextRetentionRun(evening);
    expect([
      night.getDate(),
      night.getHours(),
      night.getMinutes(),
    ]).to.deep.equal([8, 3, 15]);
    const early = nextRetentionRun(new Date(2026, 9, 7, 1, 0));
    expect(early.getDate()).to.equal(7);
  });
});

const DAY_MS = 86_400_000;
const RANGE = {
  from: new Date("2026-09-01T00:00:00.000Z"),
  to: new Date("2026-09-04T00:00:00.000Z"),
};

const sendOn = (
  day: number,
  status: SendSummary["status"],
  extra: Partial<SendSummary> = {},
): SendSummary =>
  ({
    status,
    templateSlug: "welcome",
    recipientEmail: "a@gmail.com",
    createdAt: new Date(RANGE.from.getTime() + day * DAY_MS),
    opens: 0,
    clicks: 0,
    latencyMs: 0,
    ...extra,
  }) as SendSummary;

describe("[unit] overview figures", () => {
  it("leaves the change out when no comparison window is read", () => {
    const figure = kpiFigure(
      (totals) => totals.sends,
      [sendOn(0, "sent")],
      null,
      RANGE,
    );
    expect(figure).to.deep.equal({ value: 1, sparkline: [1, 0, 0] });
  });

  it("leaves the change out against an empty previous period", () => {
    const figure = kpiFigure(
      (totals) => totals.sends,
      [sendOn(0, "sent")],
      [],
      RANGE,
    );
    expect(figure).to.deep.include({ value: 1, previousValue: 0 });
    expect(figure).to.not.have.property("delta");
  });

  it("leaves out a rate without a base", () => {
    const figure = kpiFigure((totals) => totals.openRate, [], [], RANGE);
    expect(figure).to.deep.equal({ sparkline: [] });
  });

  it("leaves the suppressed sends out of the volume, now and before", () => {
    const previousRange = {
      from: new Date(RANGE.from.getTime() - 3 * DAY_MS),
      to: RANGE.from,
    };
    const chart = volumeChart(
      [sendOn(0, "sent"), sendOn(0, "suppressed"), sendOn(1, "delivered")],
      RANGE,
      {
        range: previousRange,
        sends: [
          { ...sendOn(0, "sent"), createdAt: previousRange.from },
          { ...sendOn(0, "suppressed"), createdAt: previousRange.from },
        ] as SendSummary[],
      },
    );
    expect(chart).to.deep.include({ value: 2, previousValue: 1 });
    expect(chart.series[0]?.data.map((point) => point.y)).to.deep.equal([
      1, 1, 0,
    ]);
    expect(
      chart.comparisonSeries[0]?.data.map((point) => point.y),
    ).to.deep.equal([1, 0, 0]);
  });

  it("measures no delivery KPI on a window nothing reported for", () => {
    const smtp = { name: "smtp", openTracking: false, clickTracking: false };
    const untracked = [sendOn(0, "sent")];
    expect(isUnmeasured("deliverability", untracked, smtp)).to.equal(true);
    expect(isUnmeasured("sends", untracked, smtp)).to.equal(false);
    expect(
      isUnmeasured("deliverability", [sendOn(0, "delivered")], smtp),
    ).to.equal(false);
  });

  it("draws no comparison series when the comparison is off", () => {
    const chart = volumeChart([sendOn(0, "sent")], RANGE, null);
    expect(chart.comparisonSeries).to.deep.equal([]);
    expect(chart).to.not.have.property("delta");
  });

  it("overlaps the previous period with the current one", () => {
    const previousRange = {
      from: new Date(RANGE.from.getTime() - 3 * DAY_MS),
      to: RANGE.from,
    };
    const previous = [
      { ...sendOn(0, "sent"), createdAt: previousRange.from },
    ] as SendSummary[];
    const chart = volumeChart([sendOn(1, "sent")], RANGE, {
      range: previousRange,
      sends: previous,
    });
    const current = chart.series[0]?.data ?? [];
    const comparison = chart.comparisonSeries[0]?.data ?? [];
    expect(comparison.map((point) => point.x)).to.deep.equal(
      current.map((point) => point.x),
    );
    expect(comparison.map((point) => point.y)).to.deep.equal([1, 0, 0]);
  });
});

describe("[unit] overview funnel", () => {
  const sends = [
    sendOn(0, "delivered"),
    sendOn(0, "opened", { opens: 1 }),
    sendOn(0, "unsubscribed", { opens: 1, clicks: 1 }),
    sendOn(0, "sent"),
  ];

  it("rates the engagement steps on the deliveries, as the KPIs do", () => {
    const steps = funnelSteps(aggregate(sends), false);
    const rates = Object.fromEntries(steps.map((step) => [step.id, step.rate]));
    expect(rates.sent).to.equal(100);
    expect(rates.delivered).to.equal(75);
    expect(rates.opened).to.be.closeTo(66.67, 0.01);
    expect(rates.clicked).to.be.closeTo(33.33, 0.01);
    expect(steps.every((step) => step.isMeasured)).to.equal(true);
  });

  it("marks the delivery steps unmeasured when nothing reports them", () => {
    const steps = funnelSteps(aggregate([sendOn(0, "sent")]), true);
    expect(
      steps.filter((step) => !step.isMeasured).map((step) => step.id),
    ).to.deep.equal(["delivered", "opened", "clicked"]);
  });

  it("states no rate when nothing was sent", () => {
    const steps = funnelSteps(aggregate([]), false);
    expect(steps.map((step) => step.rate)).to.deep.equal([
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe("[unit] overview rankings", () => {
  const delivered = (count: number, opened: number): SendSummary[] =>
    Array.from({ length: count }, (_, index) =>
      sendOn(0, index < opened ? "opened" : "delivered", {
        opens: index < opened ? 1 : 0,
      }),
    );
  const openRate = {
    extract: (totals: ReturnType<typeof aggregate>) => totals.openRate,
    minDeliveries: MIN_RANKED_DELIVERIES,
  };

  it("does not rank a domain on too few deliveries", () => {
    expect(toDomainItem("gmail.com", aggregate(delivered(2, 1)))).to.equal(
      null,
    );
    expect(toDomainItem("gmail.com", aggregate([sendOn(0, "sent")]))).to.equal(
      null,
    );
  });

  it("gives a ranked row its volume", () => {
    const item = toDomainItem(
      "gmail.com",
      aggregate(delivered(MIN_RANKED_DELIVERIES, 1)),
    );
    expect(item).to.deep.include({ value: 20 });
    expect(item?.description).to.deep.equal({
      key: "$dms_mailing.metrics.delivered_count",
      params: { count: { type: "count", value: MIN_RANKED_DELIVERIES } },
    });
  });

  it("ranks templates on their volume threshold, best first", () => {
    const templates = [template("welcome", "en")];
    const items = ranked(
      [
        toTemplateItem(
          "small",
          aggregate(delivered(2, 2)),
          templates,
          openRate,
        ),
        toTemplateItem(
          "welcome",
          aggregate(delivered(MIN_RANKED_DELIVERIES, 2)),
          templates,
          openRate,
        ),
        toTemplateItem(
          "other",
          aggregate(delivered(MIN_RANKED_DELIVERIES, 4)),
          templates,
          openRate,
        ),
      ],
      10,
    );
    expect(items.map((item) => item.id)).to.deep.equal(["other", "welcome"]);
  });
});
