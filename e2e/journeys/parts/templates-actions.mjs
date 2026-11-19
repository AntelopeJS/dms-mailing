import { check, mailing } from "../../mailing.mjs";
import { wait } from "./browser-kit.mjs";
import { content, created, live, save, table, text } from "./templates-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */
/** @typedef {import("../../mailing.mjs").Tab} Tab */

const OPEN_ATTEMPTS = 15;
const OPEN_WAIT_MS = 2000;
const POLLS = 10;

/**
 * Opens the More actions menu of a card's details drawer and reads its items, clicking again until the menu shows:
 * the gallery renders on the server and hydrates after `load`.
 *
 * @param {Tab} tab The gallery tab
 * @param {string} name The card's template name
 * @returns {Promise<string[]>} The menu items, in order
 */
async function menuOf(tab, name) {
  for (let attempt = 0; attempt < OPEN_ATTEMPTS; attempt += 1) {
    await tab.click({ role: "button", name: "Details", within: { role: "article", name } });
    const drawer = await tab.visible({ role: "button", name: "More actions" }, { timeoutMs: OPEN_WAIT_MS });
    if (!drawer.pass) continue;
    await tab.click({ role: "button", name: "More actions" });
    const menu = await tab.visible({ role: "menu", name: "More actions" }, { timeoutMs: OPEN_WAIT_MS });
    if (menu.pass) break;
  }
  const items = await tab.page.getByRole("menu", { name: "More actions" }).getByRole("menuitem").allInnerTexts();
  return items.map((item) => item.trim());
}

/**
 * Closes the open menu and drawer.
 *
 * @param {Tab} tab The gallery tab
 * @returns {Promise<void>}
 */
async function closeDrawer(tab) {
  await tab.press("Escape");
  await tab.press("Escape");
  await tab.visible({ role: "dialog" }, { hidden: true });
}

/**
 * @param {Ctx} ctx The journey
 * @param {string} id The template
 * @param {string} label What the read is for
 * @returns {Promise<string>} The template's status
 */
async function statusOf(ctx, id, label) {
  return text((await table(ctx, `read the status ${label}`, "GET", `/get?id=${id}`)).body, "status");
}

export const journeys = [
  {
    id: "more-actions-offers-only-the-moves-the-status-allows",
    title: "the More actions menu of the details drawer offers Publish the draft and Archive on a draft, Unpublish, Archive and Send to real recipients on a live template, and Publish the draft from it asks for a confirmation and makes the draft live",
    entryPoint: "/modules/mailing/templates, Details, More actions",
    async run(/** @type {Ctx} */ ctx) {
      const { id: draftId } = await created(ctx, { slug: "ma-draft", name: "ma-draft", category: "orders" });
      const saved = await save(ctx, draftId, { content: content("Subject of ma-draft") });
      await ctx.verify("the draft has a subject", [check("save answers 200", saved.status === 200, saved.body)], { critical: true });
      await live(ctx, "ma-live");
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto("/modules/mailing/templates");
      const draftMenu = await menuOf(tab, "ma-draft");
      await ctx.verify("a draft offers Publish the draft and Archive", [check("menu items", JSON.stringify(draftMenu) === JSON.stringify(["Publish the draft", "Archive"]), draftMenu)]);
      await closeDrawer(tab);
      const liveMenu = await menuOf(tab, "ma-live");
      await ctx.verify("a live template offers Unpublish, Archive and Send to real recipients", [
        check("menu items", JSON.stringify(liveMenu) === JSON.stringify(["Unpublish", "Archive", "Send to real recipients"]), liveMenu),
      ]);
      await closeDrawer(tab);
      await menuOf(tab, "ma-draft");
      await tab.click({ role: "menuitem", name: "Publish the draft" });
      await ctx.verify("Publish the draft asks for a confirmation", [tab.visible({ role: "dialog", name: "Publish “ma-draft”?" }), tab.visible({ role: "button", name: "Cancel" })], { critical: true });
      await tab.click({ role: "button", name: "Publish", exact: true });
      let status = "";
      for (let attempt = 0; attempt < POLLS; attempt += 1) {
        status = await statusOf(ctx, draftId, "after Publish the draft");
        if (status === "live") break;
        await wait(tab, 1000);
      }
      const versions = await mailing(ctx, "list the versions of ma-draft", "GET", `/templates/${draftId}/versions`);
      await ctx.verify("Publish the draft makes the draft live as version 1", [
        check("status live", status === "live", status),
        check("one published version", JSON.stringify(versions.body).includes('"version":1'), versions.body),
      ]);
    },
  },
];
