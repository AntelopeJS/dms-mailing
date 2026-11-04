import { check } from "../../mailing.mjs";
import { rowCount } from "./browser-kit.mjs";
import { created, live } from "./templates-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

export const journeys = [
  {
    id: "the-table-display-lists-the-same-templates-as-rows",
    title: "the Table view lists the templates of the gallery as rows with their name, slug, category and status, and the tabs filter it the same way",
    entryPoint: "/modules/mailing/templates, Table view",
    async run(/** @type {Ctx} */ ctx) {
      await live(ctx, "tbl-live");
      await created(ctx, { slug: "tbl-draft", name: "Tbl draft", category: "billing" });
      const archived = await created(ctx, { slug: "tbl-archived", name: "Tbl archived", category: "orders" });
      await ctx.api("archive", { method: "POST", path: `/api/mailing/templates/${archived.id}/archive`, body: {} });
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto("/modules/mailing/templates");
      await tab.click({ role: "radio", name: "Table view" });
      await ctx.verify("the table lists the non-archived templates with their status", [
        tab.visible({ role: "row", name: /^tbl-live tbl-live Copy Orders Live / }),
        tab.visible({ role: "row", name: /^Tbl draft tbl-draft Copy Billing Draft / }),
        tab.count({ role: "row", name: /tbl-archived/ }, 0),
      ]);
      await tab.click({ role: "button", name: "Archived 1", exact: true });
      await ctx.verify("the Archived tab lists the archived template only", [
        tab.visible({ role: "row", name: /^Tbl archived tbl-archived Copy Orders Archived / }),
        tab.count({ role: "row", name: /tbl-live|tbl-draft/ }, 0),
        check("one row of data", (await rowCount(tab, /tbl-archived/)) === 1, "rows"),
      ]);
    },
  },
];
