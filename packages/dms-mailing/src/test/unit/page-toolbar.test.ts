import { expect } from "chai";
import { GetMetadata } from "@antelopejs/interface-core";
import { PageMetadata } from "@antelopejs/interface-dms/page";
import { OVERVIEW_PERIOD_SCOPE, SENDS_PERIOD_SCOPE } from "../../constants";
import { OverviewPageController } from "../../pages/overview";
import { SendsPageController } from "../../pages/sends";
import { MAILING_LIVE, NEW_SENDS_LABEL } from "../../pages/toolbar";

type Toolbar = ReturnType<typeof OverviewPageController.header.serializeSync>;

const childOf = (toolbar: Toolbar, id: string) =>
  toolbar.children?.find((child) => child.id === id)?.component;

const PAGES = [
  {
    page: OverviewPageController,
    scope: OVERVIEW_PERIOD_SCOPE,
    presets: ["last-7-days", "last-30-days", "last-90-days"],
    defaultPreset: "last-30-days",
  },
  {
    page: SendsPageController,
    scope: SENDS_PERIOD_SCOPE,
    presets: ["last-24h", "last-7-days", "last-30-days"],
    defaultPreset: "last-24h",
  },
];

describe("[unit] pages page toolbar", () => {
  for (const { page, scope, presets, defaultPreset } of PAGES) {
    describe(page.name, () => {
      it("declares the module's live mode", () => {
        const { pageInfo } = GetMetadata(page, PageMetadata);
        expect(pageInfo?.live).to.deep.equal(MAILING_LIVE);
      });

      it("keeps the bar under the former header id, provider pill first", () => {
        const toolbar = page.header.serializeSync();
        expect(toolbar.componentName).to.equal("dms-page-toolbar-block");
        expect(toolbar.children?.map((child) => child.id)).to.deep.equal([
          "provider",
          "live",
          "period",
        ]);
        expect(childOf(toolbar, "provider")?.componentName).to.equal(
          "MailingProviderPill",
        );
        expect(childOf(toolbar, "live")?.options).to.include({
          missedLabel: NEW_SENDS_LABEL,
        });
      });

      it("offers the page's presets with a menu of comparisons", () => {
        const period = childOf(page.header.serializeSync(), "period");
        expect(period?.options).to.deep.include({
          id: scope,
          presets,
          defaultPreset,
          comparisons: ["previous-period", "previous-year", "none"],
          defaultComparison: "previous-period",
          comparisonControl: "menu",
        });
      });
    });
  }

  it("holds the send log while a row is open, scrolled or searched", async () => {
    const { options } = await SendsPageController.table.serialize();
    expect(options?.liveHold).to.deep.equal({
      whileRowOpen: true,
      whileScrolled: true,
      whileSearching: true,
      missedLabel: NEW_SENDS_LABEL,
    });
  });
});
