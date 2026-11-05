import { created } from "./templates-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

export const journeys = [
  {
    id: "the-details-drawer-opens-with-its-tabs-and-footer",
    title: "the info icon of a card opens the details drawer with the Preview, Variables, Performance and History tabs and the Test, Duplicate and Open the editor buttons",
    entryPoint: "/modules/mailing/templates, Details",
    async run(/** @type {Ctx} */ ctx) {
      await created(ctx, { slug: "dr-draft", name: "Dr draft" });
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto("/modules/mailing/templates");
      await tab.click({ role: "button", name: "Details", within: { role: "article", name: "Dr draft" } });
      await ctx.verify("the drawer shows its footer and its tabs", [
        tab.visible({ role: "button", name: "Open the editor" }),
        tab.visible({ role: "button", name: "Duplicate" }),
        tab.visible({ role: "button", name: "More actions" }),
        tab.shows(/Preview/),
        tab.shows(/Variables/),
        tab.shows(/Performance/),
        tab.shows(/History/),
      ]);
    },
  },
];
