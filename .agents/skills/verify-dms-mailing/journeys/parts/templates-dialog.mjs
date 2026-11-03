import { check, list, text } from "../../mailing.mjs";
import { table } from "./templates-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

export const journeys = [
  {
    id: "the-new-template-dialog-derives-the-slug-and-creates-with-the-keyboard",
    title: "New template and the N key open a dialog that derives the slug from the name, offers the starters, and Ctrl+Enter creates the template and opens the editor",
    entryPoint: "/modules/mailing/templates, New template, N, Ctrl+Enter",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto("/modules/mailing/templates");
      await ctx.verify("the gallery is empty and offers the New template tile", [tab.visible({ role: "button", name: "New template", exact: false })], { critical: true });
      await tab.press("n");
      await ctx.verify("the N key opens the dialog", [tab.visible({ role: "dialog" }), tab.shows(/Create and open the editor/)]);
      await tab.snapshot("the New template dialog");
      const inDialog = { role: "dialog", name: "New template" };
      await tab.click({ role: "radio", name: "Order confirmation starter", within: inDialog });
      await tab.fill({ role: "textbox", name: "Name", exact: true, within: inDialog }, "Order confirmation");
      const slug = await tab.value({ role: "textbox", name: "Slug auto from name", within: inDialog });
      await ctx.verify("the slug follows the name", [check("slug order-confirmation", slug === "order-confirmation", slug)]);
      await tab.press("Control+Enter");
      await ctx.verify("Ctrl+Enter creates the template and opens its editor", [tab.at(/^\/modules\/mailing\/templates\/[^/]+$/)], { critical: true });
      const listed = await table(ctx, "list the templates", "GET", "/list?limit=100");
      const rows = list(listed.body, "results");
      const row = rows.find((entry) => text(entry, "slug") === "order-confirmation");
      await ctx.verify("the template exists as a draft with the derived slug", [
        check("slug order-confirmation", row !== undefined, listed.body),
        check("draft", text(row, "status") === "draft", row),
        check("name Order confirmation", text(row, "name") === "Order confirmation", row),
        check("the starter gave its category and both locales", text(row, "category") === "orders" && text(row, "locales") === "en,fr", row),
      ]);
    },
  },
];
