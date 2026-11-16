import { check, list, mailing, text } from "../../mailing.mjs";
import { declareLive } from "./api-kit.mjs";
import { fillUntilChanged, openSettings, saveChanges } from "./settings-page.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

/**
 * @param {Ctx} ctx The journey
 * @returns {Promise<Array<Record<string, unknown>>>} The stored categories
 */
async function stored(ctx) {
  return list((await mailing(ctx, "read the settings", "GET", "/settings")).body, "categories");
}

const NAME = { role: "textbox", name: "Category name" };

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
export const categoriesPage = {
  id: "the-categories-editor-adds-renames-reorders-and-asks-where-templates-go",
  title: "the Template categories editor lists the categories with their template counts, adds one, renames one, reorders with the arrow keys, offers no removal of marketing, and asks where the templates go before it removes a category in use",
  entryPoint: "/modules/mailing/settings",
  async run(ctx) {
    await declareLive(ctx, "cat-bill-a", { category: "billing", variables: [] });
    await declareLive(ctx, "cat-bill-b", { category: "billing", variables: [] });
    const tab = await openSettings(ctx);
    await ctx.verify("the five default categories with their usage", [
      ...["Orders", "Account & access", "Billing", "Marketing", "Forms"].map((label, index) => tab.visible({ ...NAME, nth: index })),
      check("the names in order", JSON.stringify(await Promise.all([0, 1, 2, 3, 4].map((index) => tab.value({ ...NAME, nth: index })))) === JSON.stringify(["Orders", "Account & access", "Billing", "Marketing", "Forms"]), "names"),
      tab.shows(/2 templates/),
      tab.shows(/no template/),
    ]);
    await ctx.verify("Marketing, which campaign rules depend on, cannot be removed; the others can", [
      tab.count({ role: "button", name: "Remove" }, 4),
    ]);

    await fillUntilChanged(tab, { ...NAME, nth: 4 }, "Contact forms");
    await tab.click({ role: "button", name: "Add a category" });
    await tab.fill({ ...NAME, nth: 5 }, "Subscriptions");
    await saveChanges(tab);
    await ctx.verify("a rename and a new category are saved", [tab.shows(/Settings saved/)]);
    const afterRename = await stored(ctx);
    await ctx.verify("the API holds them", [
      check("six categories, forms renamed in English with its id kept", afterRename.length === 6 && text(afterRename[4], "id") === "forms" && text(afterRename[4], "label", "en") === "Contact forms", afterRename.map((row) => [row.id, row.label])),
      check("the new category is last, with an id from its name and the label", text(afterRename[5], "label", "en") === "Subscriptions" && text(afterRename[5], "id").startsWith("subscriptions"), afterRename[5]),
      check("the French labels of the others are kept", text(afterRename[0], "label", "fr") === "Commandes", afterRename[0]),
    ]);

    await tab.press("Space", { role: "button", name: "Drag, or use the arrow keys, to reorder", nth: 0 });
    await tab.press("ArrowDown", { role: "button", name: "Drag, or use the arrow keys, to reorder", nth: 0 });
    await tab.press("Space", { role: "button", name: "Drag, or use the arrow keys, to reorder", nth: 1 });
    await ctx.verify("the arrow keys move a category and raise the save bar", [tab.visible({ role: "button", name: "Save changes" })]);
    await saveChanges(tab);
    const reordered = await stored(ctx);
    await ctx.verify("the new order is stored", [check("account first, orders second", text(reordered[0], "id") === "account" && text(reordered[1], "id") === "orders", reordered.map((row) => row.id))]);

    await tab.click({ role: "button", name: "Remove", nth: 2 });
    await ctx.verify("removing a category in use asks where its templates go", [
      tab.visible({ role: "dialog", name: "Remove “Billing”?" }),
      tab.shows(/2 templates use it\./),
    ]);
    await tab.click({ role: "combobox", name: "Move them to" });
    await tab.click({ role: "option", name: "Orders" });
    await tab.click({ role: "button", name: "Remove", exact: true, within: { role: "dialog" } });
    await saveChanges(tab);
    await ctx.verify("the move is announced", [tab.shows(/2 templates changed category\./)]);
    const categories = await stored(ctx);
    const rows = list((await mailing(ctx, "list the templates", "GET", "/tables/templates/list?limit=50")).body, "results");
    await ctx.verify("Billing is gone and its two templates are in Orders", [
      check("no billing category", !categories.some((row) => row.id === "billing"), categories.map((row) => row.id)),
      check("both templates moved to orders", ["cat-bill-a", "cat-bill-b"].every((slug) => text(rows.find((row) => text(row, "slug") === slug), "category") === "orders"), rows.map((row) => [row.slug, row.category])),
    ]);
    await tab.click({ role: "button", name: "Remove", nth: 3 });
    await ctx.verify("a category nobody uses goes without a question", [
      tab.visible({ role: "dialog" }, { hidden: true, timeoutMs: 2500 }),
      tab.count(NAME, 4),
    ]);
    await saveChanges(tab);
    await ctx.verify("the removal is stored", [tab.shows(/Settings saved/), check("four categories left, subscriptions among the removed", JSON.stringify((await stored(ctx)).map((row) => row.id)) === JSON.stringify(["account", "orders", "marketing", "forms"]), (await stored(ctx)).map((row) => row.id))]);
  },
};
