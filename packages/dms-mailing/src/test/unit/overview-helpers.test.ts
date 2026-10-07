import { expect } from "chai";
import type { MailingTemplate, SendSummary } from "../../db";
import { filterByKind, readFunnelKind } from "../../routes/metrics";
import { nextRetentionRun } from "../../routes/settings";
import { missingLocaleTemplates } from "../../services/attention";

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
