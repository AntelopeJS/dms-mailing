import { MAILING, calling, check, list, mailing, raw, text } from "../../mailing.mjs";
import { declareLive } from "./api-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

/**
 * A request as the account `admin` reading in a language (`x-content-language`).
 *
 * @param {Ctx} ctx The journey
 * @param {string} language The content language
 * @param {string} label What the call does
 * @param {{ method: string, path: string, body?: unknown }} request The method, the path under the mailing API and the JSON body
 */
function reading(ctx, language, label, request) {
  const { method, path, body } = request;
  return raw(ctx, `${label} in ${language}`, {
    path: `${MAILING}${path}`,
    method,
    as: "admin",
    headers: { "x-content-language": language, "content-type": "application/json" },
    body: body === undefined ? undefined : Buffer.from(JSON.stringify(body)),
  });
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
export const localizedJourney = {
  id: "declared-names-and-labels-are-read-in-the-language-of-the-reader",
  title: "a template name and a category label declared per language are read in the language the reader works in (x-content-language), the English text for a language without one; the templates table searches and sorts that text; a rename writes the language of whoever renames and leaves the others",
  entryPoint: "DeclareTemplate, DeclareTemplateCategory, GET /api/mailing/tables/templates/list",
  async run(ctx) {
    await mailing(ctx, "open the settings", "GET", "/settings");
    await calling(ctx, "declare a category in two languages", "category", [{ tenantId: "default", id: "subs", label: { en: "Subscriptions", fr: "Abonnements" }, icon: "i-ph-repeat" }]);
    const both = await declareLive(ctx, "zeta-both", { name: { en: "Zeta renewal", fr: "Renouvellement alpha" }, category: "subs", variables: [] });
    await declareLive(ctx, "alpha-english", { name: { en: "Alpha welcome" }, variables: [] });
    const names = async (/** @type {string} */ language, query = "") => list((await reading(ctx, language, "list the templates", { method: "GET", path: `/tables/templates/list?limit=50${query}` })).json, "results").map((row) => text(row, "name"));
    await ctx.verify("each reader sees the name in their language, English where there is none", [
      check("English: both English names", (await names("en")).sort().join("|") === "Alpha welcome|Zeta renewal", await names("en")),
      check("French: the French name and the English text of the template without French", (await names("fr")).sort().join("|") === "Alpha welcome|Renouvellement alpha", await names("fr")),
      check("a language nobody wrote (German): English throughout", (await names("de")).sort().join("|") === "Alpha welcome|Zeta renewal", await names("de")),
    ]);
    const searchFr = await names("fr", "&search=renouvellement");
    const searchEn = await names("en", "&search=renewal");
    const searchWrong = await names("fr", "&search=renewal");
    await ctx.verify("the table searches the text of the reader's language", [
      check("French reader finds the French name", JSON.stringify(searchFr) === '["Renouvellement alpha"]', searchFr),
      check("English reader finds the English name", JSON.stringify(searchEn) === '["Zeta renewal"]', searchEn),
      check("the French reader does not find the English text of a template that has a French one", searchWrong.length === 0, searchWrong),
    ]);
    const ascending = await names("fr", "&sortKey=name&sortDirection=asc");
    const descending = await names("fr", "&sortKey=name&sortDirection=desc");
    const englishDescending = await names("en", "&sortKey=name&sortDirection=desc");
    await ctx.verify("the table sorts the reader's text", [
      check("French ascending: Alpha welcome, Renouvellement alpha", JSON.stringify(ascending) === '["Alpha welcome","Renouvellement alpha"]', ascending),
      check("French descending: Renouvellement alpha, Alpha welcome", JSON.stringify(descending) === '["Renouvellement alpha","Alpha welcome"]', descending),
      check("English descending: Zeta renewal, Alpha welcome", JSON.stringify(englishDescending) === '["Zeta renewal","Alpha welcome"]', englishDescending),
    ]);
    const subs = async (/** @type {string} */ language) => list((await reading(ctx, language, "read the categories", { method: "GET", path: "/templates/categories" })).json, "categories").find((row) => text(row, "id") === "subs");
    await ctx.verify("a category label follows the reader too", [
      check("French: Abonnements", text(await subs("fr"), "label") === "Abonnements", await subs("fr")),
      check("English: Subscriptions", text(await subs("en"), "label") === "Subscriptions", await subs("en")),
    ]);
    const renamed = await reading(ctx, "fr", "rename the template", { method: "PUT", path: `/templates/${both.id}/details`, body: { name: "Reconduction", category: "subs" } });
    await ctx.verify("a rename writes the language of whoever renames", [
      check("HTTP 200", renamed.status === 200, renamed.text),
      check("French readers read the new name", (await names("fr")).sort().join("|") === "Alpha welcome|Reconduction", await names("fr")),
      check("English readers still read the English name", (await names("en")).sort().join("|") === "Alpha welcome|Zeta renewal", await names("en")),
    ]);
  },
};
