import { check } from "../../mailing.mjs";
import { plain, render, scratch, SHOWN } from "./editor-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

/**
 * @param {string} unsubscribe The unsubscribe label
 * @param {string} preferences The preferences label
 * @returns {Record<string, unknown>[]} A footer block
 */
function footer(unsubscribe, preferences) {
  return [{ id: "footer", type: "footer", ...SHOWN, text: "Legal line", unsubscribeLabel: unsubscribe, preferencesLabel: preferences }];
}

export const journeys = [
  {
    id: "footer-links-need-a-label-and-a-url-and-tokens-report-what-is-missing",
    title: "a footer link shows only with its label and its URL, an empty label removes it, and the preview names the variables the data does not carry",
    entryPoint: "POST /api/mailing/templates/:id/preview",
    async run(/** @type {Ctx} */ ctx) {
      const id = await scratch(ctx, "footer-links");
      const urls = { unsubscribeUrl: "https://app.test/unsubscribe/abc", preferencesUrl: "https://app.test/preferences" };
      const both = await render(ctx, id, { data: urls, blocks: footer("Unsubscribe", "Preferences") });
      const noUrl = await render(ctx, id, { data: {}, blocks: footer("Unsubscribe", "Preferences") });
      const noLabel = await render(ctx, id, { data: urls, blocks: footer("", "") });
      const onlyPreferences = await render(ctx, id, { data: urls, blocks: footer("", "Preferences") });
      await ctx.verify("footer links", [
        check("both links with their URLs and labels", /<a href="https:\/\/app\.test\/unsubscribe\/abc"[^>]*>Unsubscribe</.test(both.html) && /<a href="https:\/\/app\.test\/preferences"[^>]*>Preferences</.test(both.html), plain(both.html)),
        check("a link whose URL is missing is dropped", !/Unsubscribe|Preferences/.test(plain(noUrl.html)) && !noUrl.html.includes("<a "), plain(noUrl.html)),
        check("an empty label removes the link", !noLabel.html.includes("app.test"), plain(noLabel.html)),
        check("one empty label removes only its link", !onlyPreferences.html.includes("unsubscribe/abc") && onlyPreferences.html.includes("https://app.test/preferences"), plain(onlyPreferences.html)),
      ]);
      const paragraph = [{ id: "p", type: "paragraph", ...SHOWN, text: "Hello {{customer.firstName}}, order {{order.number}}", align: "left" }];
      const missing = await render(ctx, id, { data: { order: { number: "#1" } }, blocks: paragraph });
      const none = await render(ctx, id, { data: { customer: { firstName: "Sofie" }, order: { number: "#1" } }, blocks: paragraph });
      await ctx.verify("the preview names the variables the data does not carry", [
        check("exactly customer.firstName is missing", JSON.stringify(missing.missing) === '["customer.firstName"]', missing.missing),
        check("nothing is missing with the data", JSON.stringify(none.missing) === "[]", none.missing),
      ]);
    },
  },
];
