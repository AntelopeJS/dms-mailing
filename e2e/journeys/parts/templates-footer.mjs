import { check, list, mailing, text } from "../../mailing.mjs";
import { created } from "./templates-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

/**
 * @param {import("../../mailing.mjs").Ctx} ctx The journey
 * @param {string} id The template
 * @returns {Promise<{ unsubscribe: string, preferences: string, text: string, blocks: string[] }>} The footer block of its English draft
 */
async function footerOf(ctx, id) {
  const read = await mailing(ctx, "read the draft", "GET", `/templates/${id}/content`);
  const blocks = list(read.body, "content", "locales", "en", "blocks");
  const footer = blocks.find((block) => text(block, "type") === "footer");
  return { unsubscribe: text(footer, "unsubscribeLabel"), preferences: text(footer, "preferencesLabel"), text: text(footer, "text"), blocks: blocks.map((block) => text(block, "type")) };
}

export const journeys = [
  {
    id: "a-new-footer-has-its-links-only-for-marketing-or-no-category",
    title: "a new blank template gets the unsubscribe and preferences links in the marketing category and without a category, and a legal line alone in any other category and from a starter",
    entryPoint: "POST /api/mailing/tables/templates/new",
    async run(/** @type {Ctx} */ ctx) {
      /** @type {[string, Record<string, unknown>, boolean][]} */
      const cases = [
        ["orders", { slug: "foot-orders", name: "Foot orders", category: "orders" }, false],
        ["billing", { slug: "foot-billing", name: "Foot billing", category: "billing" }, false],
        ["marketing", { slug: "foot-marketing", name: "Foot marketing", category: "marketing" }, true],
        ["no category", { slug: "foot-none", name: "Foot none" }, true],
        ["a starter", { slug: "foot-starter", name: "Foot starter", category: "orders", starterId: "order-confirmed" }, false],
      ];
      for (const [label, fields, links] of cases) {
        const made = await created(ctx, fields);
        const footer = await footerOf(ctx, made.id);
        await ctx.verify(`${label}: the footer`, [
          check("created", made.answer.status === 200, made.answer.body),
          links
            ? check("both links have a label", footer.unsubscribe !== "" && footer.preferences !== "", footer)
            : check("no link label: a legal line alone", footer.unsubscribe === "" && footer.preferences === "" && footer.blocks.includes("footer"), footer),
        ]);
      }
      const noCategory = await footerOf(ctx, (await created(ctx, { slug: "foot-labels", name: "Foot labels" })).id);
      await ctx.verify("the labels are the module's words", [check("Unsubscribe and Preferences", /unsubscribe/i.test(noCategory.unsubscribe) && /preferences/i.test(noCategory.preferences), noCategory)]);
    },
  },
];
