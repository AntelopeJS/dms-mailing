import { calling, check, mailing } from "../../mailing.mjs";
import { created, save } from "./templates-kit.mjs";
import { SHOWN } from "./editor-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

/**
 * @param {string} line One paragraph
 * @returns {Record<string, unknown>} A paragraph block
 */
function paragraph(line) {
  return { id: `p-${line.length}-${line.slice(0, 6)}`, type: "paragraph", ...SHOWN, text: line, align: "left" };
}

/**
 * Sends an alternate body through SendTemplate and returns what the sink received.
 *
 * @param {Ctx} ctx The journey
 * @param {string} slug A live template
 * @param {string} locale The locale of the send
 * @param {string[]} lines The paragraphs of the alternate body
 * @param {Record<string, unknown>} variables The variables
 * @returns {Promise<string>} The plain text of the e-mail
 */
async function sendBody(ctx, slug, locale, lines, variables) {
  const to = ctx.email(`fmt-${locale}`);
  const content = { locales: { [locale]: { subject: "Formats", preheader: "", blocks: lines.map(paragraph) } } };
  await calling(ctx, `send in ${locale}`, "send", [slug, { tenantId: "default", to: { email: to }, locale, content, variables }]);
  const mail = await ctx.mail((message) => message.to.some((address) => address.includes(to)));
  return (mail.match?.text ?? "").replace(/[\s  ]+/g, " ");
}

export const journeys = [
  {
    id: "amounts-and-dates-are-written-in-the-locale-of-the-send",
    title: "a money value, a Date and a declared date are written for the locale of the send, while other values, numbers and formatted strings go out as given",
    entryPoint: "SendTemplate with content, variables and locale",
    async run(/** @type {Ctx} */ ctx) {
      const { id } = await created(ctx, { slug: "formats", name: "Formats", category: "orders" });
      await save(ctx, id, {
        content: { locales: { en: { subject: "Formats", preheader: "", blocks: [] }, fr: { subject: "Formats", preheader: "", blocks: [] } } },
        variables: [{ path: "quote.validUntil", type: "date", required: false }],
      });
      await mailing(ctx, "publish", "POST", `/templates/${id}/publish`, { body: {} });
      const lines = ["Total {{quote.total}}", "Date {{quote.sentOn}}", "Valid {{quote.validUntil}}", "Number {{quote.number}}", "Text {{quote.label}}", "Odd {{quote.odd}}", "Lines {{quote.items.length}} first {{quote.items.0.name}}"];
      const variables = {
        quote: {
          total: { value: 987420, currency: "EUR" },
          sentOn: { $date: "2026-11-14T12:00:00.000Z" },
          validUntil: "2026-11-14",
          number: 12345,
          label: "48.00",
          odd: { value: 987420, currency: "EURO" },
          items: [{ name: "Linen shirt" }, { name: "Socks" }],
        },
      };
      const fr = await sendBody(ctx, "formats", "fr", lines, variables);
      const en = await sendBody(ctx, "formats", "en", lines, variables);
      await ctx.verify("French", [
        check("money 9 874,20 €", fr.includes("Total 9 874,20 €"), fr),
        check("a Date as a long date", fr.includes("Date 14 novembre 2026"), fr),
        check("a declared date as a long date", fr.includes("Valid 14 novembre 2026"), fr),
        check("a number is not reformatted", fr.includes("Number 12345"), fr),
        check("a formatted string is written as given", fr.includes("Text 48.00"), fr),
        check("a list's length and an element by index", fr.includes("Lines 2 first Linen shirt"), fr),
      ]);
      await ctx.verify("English", [
        check("money €9,874.20", en.includes("Total €9,874.20"), en),
        check("a Date as a long date", en.includes("Date November 14, 2026"), en),
        check("a declared date as a long date", en.includes("Valid November 14, 2026"), en),
        check("a number is not reformatted", en.includes("Number 12345"), en),
        check("an unknown currency writes a plain number", en.includes("Odd 987,420 "), en),
      ]);
      const isoUndeclared = await sendBody(ctx, "formats", "en", ["Moment {{when}}"], { when: "2026-11-14" });
      await ctx.verify("an ISO string at a path the template does not declare date is written as given", [check("as given", isoUndeclared.includes("Moment 2026-11-14"), isoUndeclared)]);
    },
  },
];
