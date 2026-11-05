import { check } from "../../mailing.mjs";
import { rowCount } from "./browser-kit.mjs";
import { created, live } from "./templates-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */
/** @typedef {import("../../mailing.mjs").Tab} Tab */

const TEMPLATE_ROWS = /^(tbl-live|Tbl draft|Tbl archived) /;
const LIVE_ROW = /^tbl-live tbl-live Copy Orders Live /;
const DRAFT_ROW = /^Tbl draft tbl-draft Copy Billing Draft /;
const ARCHIVED_ROW = /^Tbl archived tbl-archived Copy Orders Archived /;

/**
 * Waits until the table shows what a tab or a display switch should leave: the rows that must appear are
 * visible and the rows that must go are gone. The old rows stay on screen until the new ones arrive, so a count
 * taken before this settles reads the page being replaced.
 *
 * @param {Tab} tab The tab
 * @param {{ shown?: RegExp[], gone?: RegExp[] }} settled The row names that must be visible and the ones that must be absent
 * @returns {Promise<import("../../mailing.mjs").Check[]>} The checks that settled
 */
async function settle(tab, { shown = [], gone = [] }) {
  const checks = [];
  for (const name of shown) checks.push(await tab.visible({ role: "row", name }));
  for (const name of gone) checks.push(await tab.visible({ role: "row", name }, { hidden: true }));
  return checks;
}

export const journeys = [
  {
    id: "the-table-display-lists-the-same-templates-as-rows",
    title: "switching the templates page from the Gallery to the Table view swaps the cards for rows that carry each template's name, slug, category and status, the tabs filter the rows as they filter the cards, and Gallery brings the cards back",
    entryPoint: "/modules/mailing/templates, Table view",
    async run(/** @type {Ctx} */ ctx) {
      await live(ctx, "tbl-live");
      await created(ctx, { slug: "tbl-draft", name: "Tbl draft", category: "billing" });
      const archived = await created(ctx, { slug: "tbl-archived", name: "Tbl archived", category: "orders" });
      await ctx.api("archive", { method: "POST", path: `/api/mailing/templates/${archived.id}/archive`, body: {} });
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto("/modules/mailing/templates");
      await ctx.verify("the page opens on the Gallery", [
        tab.visible({ role: "article", name: "tbl-live" }),
        tab.visible({ role: "article", name: "Tbl draft" }),
        tab.count({ role: "row", name: TEMPLATE_ROWS }, 0),
      ]);
      await tab.click({ role: "radio", name: "Table view" });
      const listed = await settle(tab, { shown: [LIVE_ROW, DRAFT_ROW] });
      await ctx.verify("the table lists the non-archived templates with their status", [
        ...listed,
        tab.count({ role: "row", name: /tbl-archived/ }, 0),
        tab.count({ role: "article", name: /tbl-live|Tbl draft/ }, 0),
        check("exactly two rows of templates", (await rowCount(tab, TEMPLATE_ROWS)) === 2, await rowCount(tab, TEMPLATE_ROWS)),
      ]);
      await tab.click({ role: "button", name: "Live 1", exact: true });
      const onlyLive = await settle(tab, { shown: [LIVE_ROW], gone: [DRAFT_ROW, ARCHIVED_ROW] });
      await ctx.verify("the Live tab lists the live template only", [...onlyLive, check("one row of templates", (await rowCount(tab, TEMPLATE_ROWS)) === 1, await rowCount(tab, TEMPLATE_ROWS))]);
      await tab.click({ role: "button", name: "Drafts 1", exact: true });
      const onlyDraft = await settle(tab, { shown: [DRAFT_ROW], gone: [LIVE_ROW, ARCHIVED_ROW] });
      await ctx.verify("the Drafts tab lists the draft only", [...onlyDraft, check("one row of templates", (await rowCount(tab, TEMPLATE_ROWS)) === 1, await rowCount(tab, TEMPLATE_ROWS))]);
      await tab.click({ role: "button", name: "Archived 1", exact: true });
      const onlyArchived = await settle(tab, { shown: [ARCHIVED_ROW], gone: [LIVE_ROW, DRAFT_ROW] });
      await ctx.verify("the Archived tab lists the archived template only", [...onlyArchived, check("one row of templates", (await rowCount(tab, TEMPLATE_ROWS)) === 1, await rowCount(tab, TEMPLATE_ROWS))]);
      await tab.click({ role: "button", name: "All 2", exact: true });
      await settle(tab, { shown: [LIVE_ROW, DRAFT_ROW], gone: [ARCHIVED_ROW] });
      await tab.click({ role: "radio", name: "Gallery" });
      await ctx.verify("Gallery brings the cards back", [
        tab.visible({ role: "article", name: "tbl-live" }),
        tab.visible({ role: "article", name: "Tbl draft" }),
        tab.visible({ role: "row", name: TEMPLATE_ROWS }, { hidden: true }),
      ]);
    },
  },
];
