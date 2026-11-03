import { check, list, mailing, pick, text } from "../../mailing.mjs";
import { declareLive } from "./api-kit.mjs";
import { putSettings } from "./settings-basics.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const entry = (/** @type {string} */ id, /** @type {string} */ en, icon = "i-ph-tag", fr = en) => ({ id, label: { en, fr }, icon });

/**
 * @param {Ctx} ctx The journey
 * @returns {Promise<Array<Record<string, unknown>>>} The stored categories
 */
async function categoriesOf(ctx) {
  return list((await mailing(ctx, "read the settings", "GET", "/settings")).body, "categories");
}

/**
 * @param {Ctx} ctx The journey
 * @returns {Promise<Record<string, string>>} The category of each template, by slug
 */
async function templateCategories(ctx) {
  const rows = list((await mailing(ctx, "list the templates", "GET", "/tables/templates/list?limit=100")).body, "results");
  return Object.fromEntries(rows.map((row) => [text(row, "slug"), text(row, "category")]));
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} */
export const categoryJourneys = [
  {
    id: "categories-are-added-renamed-reordered-and-validated",
    title: "the categories list takes new categories, renamed labels, another icon and another order; it refuses a blank or duplicate label, a duplicate id, a bad icon or id, and a list without marketing, while marketing can be renamed",
    entryPoint: "PUT /api/mailing/settings",
    async run(ctx) {
      await mailing(ctx, "open the settings", "GET", "/settings");
      const start = await categoriesOf(ctx);
      const refused = async (/** @type {string} */ name, /** @type {unknown[]} */ categories, /** @type {string} */ message, /** @type {string} */ path) => {
        const answer = await putSettings(ctx, `refuse ${name}`, { categories });
        const issue = list(answer.body, "issues")[0];
        return check(`${name}: 400, ${message}${path ? ` at ${path}` : ""}`, answer.status === 400 && text(issue, "message") === message && (path === "" || JSON.stringify(issue?.path) === path), [answer.status, answer.body]);
      };
      const marketing = entry("marketing", "Marketing", "i-ph-sparkle");
      await ctx.verify("a list that breaks a rule is refused with the message under its row", [
        await refused("a blank label", [marketing, entry("blank", "")], "$dms_mailing.settings.categories.label_required", '["categories",1,"label"]'),
        await refused("a duplicate label in other case", [marketing, entry("other", "MARKETING")], "$dms_mailing.settings.categories.label_duplicate", '["categories",1,"label"]'),
        await refused("a duplicate id", [marketing, entry("marketing", "Other label")], "$dms_mailing.settings.categories.label_duplicate", '["categories",1,"id"]'),
        await refused("a list without marketing", [entry("orders", "Orders")], "$dms_mailing.settings.categories.marketing_required", '["categories"]'),
        await refused("an empty list", [], "$dms_mailing.settings.categories.marketing_required", '["categories"]'),
      ]);
      const badIcon = await putSettings(ctx, "refuse an icon that is not a Phosphor name", { categories: [marketing, entry("x", "X", "package")] });
      const badId = await putSettings(ctx, "refuse an id that is not a slug", { categories: [marketing, entry("Bad Id", "Bad")] });
      const badMove = await putSettings(ctx, "refuse a move to a category that is not kept", { categories: [marketing, { ...entry("old", "Old"), moveTo: "nowhere" }] });
      await ctx.verify("icon, id and move target are checked", [
        check("an icon without the i-ph- prefix: 400", badIcon.status === 400, badIcon.body),
        check("an id that is not a slug: 400", badId.status === 400, badId.body),
        check("a move to a category that is not kept: 400", badMove.status === 400, badMove.body),
        check("nothing changed", JSON.stringify(await categoriesOf(ctx)) === JSON.stringify(start), "changed"),
      ]);

      const added = [...start, entry("subscriptions", "Subscriptions", "i-ph-repeat", "Abonnements")];
      await putSettings(ctx, "add a category", { categories: added });
      const afterAdd = await categoriesOf(ctx);
      await ctx.verify("a category is added at the end", [
        check("six categories, the new one last", afterAdd.length === 6 && text(afterAdd[5], "id") === "subscriptions", afterAdd.map((row) => row.id)),
        check("its labels and icon are kept", text(afterAdd[5], "label", "fr") === "Abonnements" && text(afterAdd[5], "icon") === "i-ph-repeat", afterAdd[5]),
      ]);
      const reordered = [...afterAdd].reverse().map((row) => (text(row, "id") === "marketing" ? { ...row, label: { en: "Campaigns", fr: "Campagnes" }, icon: "i-ph-megaphone" } : row));
      await putSettings(ctx, "reverse the order, rename marketing and change its icon", { categories: reordered });
      await ctx.restartBackend();
      const stored = await categoriesOf(ctx);
      await ctx.verify("the order, the renamed marketing and the icon survive a restart", [
        check("the order is reversed", JSON.stringify(stored.map((row) => row.id)) === JSON.stringify(reordered.map((row) => text(row, "id"))), stored.map((row) => row.id)),
        check("marketing keeps its id and has the new labels and icon", text(stored.find((row) => row.id === "marketing"), "label", "en") === "Campaigns" && text(stored.find((row) => row.id === "marketing"), "label", "fr") === "Campagnes" && text(stored.find((row) => row.id === "marketing"), "icon") === "i-ph-megaphone", stored.find((row) => row.id === "marketing")),
      ]);
    },
  },
  {
    id: "removing-a-category-moves-its-templates-and-the-usage-counts-live-ones",
    title: "removing a category moves its templates to the category named or to none and the write says how many changed; the category usage counts the templates of each category and leaves archived ones out",
    entryPoint: "PUT /api/mailing/settings, GET /api/mailing/settings/category-usage",
    async run(ctx) {
      await mailing(ctx, "open the settings", "GET", "/settings");
      const slugs = [["bill-a", "billing"], ["bill-b", "billing"], ["form-a", "forms"], ["ord-a", "orders"], ["ord-archived", "orders"]];
      const ids = {};
      for (const [slug, category] of slugs) ids[slug] = (await declareLive(ctx, slug, { category, variables: [] })).id;
      await mailing(ctx, "archive a template", "POST", `/templates/${ids["ord-archived"]}/archive`, { body: {} });
      const usage = await mailing(ctx, "read the category usage", "GET", "/settings/category-usage");
      await ctx.verify("the usage counts live templates per category and leaves the archived one out", [
        check("billing 2, forms 1, orders 1", pick(usage.body, "counts", "billing") === 2 && pick(usage.body, "counts", "forms") === 1 && pick(usage.body, "counts", "orders") === 1, pick(usage.body, "counts")),
        check("no entry for an unused category", pick(usage.body, "counts", "account") === undefined, pick(usage.body, "counts")),
      ]);
      const current = list((await mailing(ctx, "read the settings", "GET", "/settings")).body, "categories");
      const byId = (/** @type {string} */ id) => current.find((row) => row.id === id) ?? {};
      const removed = await putSettings(ctx, "remove billing (moved to orders) and forms (to none)", {
        categories: [byId("orders"), byId("account"), { ...byId("billing"), moveTo: "orders" }, byId("marketing")],
      });
      const categories = await templateCategories(ctx);
      await ctx.verify("the templates of a removed category move where it was told", [
        check("HTTP 200 and a notice of 3 changed templates", removed.status === 200 && text(pick(removed.body, "notice"), "title") === "$dms_mailing.settings.categories.reassigned" && pick(removed.body, "notice", "params", "count") === 3, pick(removed.body, "notice")),
        check("the billing templates are in orders", categories["bill-a"] === "orders" && categories["bill-b"] === "orders", categories),
        check("the forms template, not moved, has no category", categories["form-a"] === "", categories),
        check("an untouched category keeps its templates", categories["ord-a"] === "orders" && categories["ord-archived"] === "orders", categories),
        check("the stored list lost billing and forms", JSON.stringify((await mailing(ctx, "read the settings", "GET", "/settings")).body && list((await mailing(ctx, "read the settings", "GET", "/settings")).body, "categories").map((row) => row.id)) === '["orders","account","marketing"]', "list"),
      ]);
      const quiet = await putSettings(ctx, "rename a category nobody uses", { categories: [byId("orders"), { ...byId("account"), label: { en: "Access", fr: "Accès" } }, byId("marketing")] });
      await ctx.verify("a write that moves nothing carries no notice", [check("no notice", pick(quiet.body, "notice") === undefined, quiet.body)]);
    },
  },
];
