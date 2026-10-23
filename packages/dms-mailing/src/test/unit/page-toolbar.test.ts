import { expect } from "chai";
import { GetMetadata } from "@antelopejs/interface-core";
import type { ComponentInfoSerialized } from "@antelopejs/interface-dms/component";
import { PageMetadata } from "@antelopejs/interface-dms/page";
import {
  MAILING_SENDS_TOPIC,
  OVERVIEW_PERIOD_SCOPE,
  SENDS_PERIOD_SCOPE,
} from "../../constants";
import { OverviewPageController } from "../../pages/overview";
import { SendsPageController } from "../../pages/sends";
import { MAILING_LIVE, NEW_SENDS_LABEL } from "../../pages/toolbar";

/** Sends, deliverability, open and click rates, bounces, unsubscribes. */
const OVERVIEW_KPI_COUNT = 6;

type Toolbar = ReturnType<typeof OverviewPageController.header.serializeSync>;

const childOf = (toolbar: Toolbar, id: string) =>
  toolbar.children?.find((child) => child.id === id)?.component;

const optionsOf = (block: ComponentInfoSerialized): Record<string, unknown> =>
  (block.options ?? {}) as Record<string, unknown>;

/** The blocks under `block` that read a period of figures. */
function periodBlocks(
  block: ComponentInfoSerialized,
): ComponentInfoSerialized[] {
  const own = optionsOf(block).periodScope ? [block] : [];
  return [
    ...own,
    ...(block.children ?? []).flatMap((child) => periodBlocks(child.component)),
  ];
}

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

  it("refreshes every period block of both pages on a send", () => {
    const blocks = [
      ...periodBlocks(OverviewPageController.dashboard.serializeSync()),
      ...periodBlocks(SendsPageController.stats.serializeSync()),
    ];
    expect(blocks).to.have.length.greaterThan(0);
    for (const block of blocks) {
      expect(optionsOf(block).realtimeTopic, block.componentName).to.equal(
        MAILING_SENDS_TOPIC,
      );
    }
  });

  it("refreshes the six Overview KPI cards on a send", () => {
    const kpiCards = periodBlocks(
      OverviewPageController.dashboard.serializeSync(),
    ).filter((block) => block.componentName === "dms-kpi-card");
    expect(kpiCards).to.have.length(OVERVIEW_KPI_COUNT);
    for (const card of kpiCards) {
      expect(optionsOf(card).realtimeTopic).to.equal(MAILING_SENDS_TOPIC);
    }
  });

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
