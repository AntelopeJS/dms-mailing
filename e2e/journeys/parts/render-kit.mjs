import { declareLive, partsOf, sendCode, subjectOfHead } from "./api-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

/**
 * @param {string} id The block id
 * @param {string} type The block type
 * @param {Record<string, unknown>} fields The block's own fields
 * @returns {Record<string, unknown>} A block
 */
export const block = (id, type, fields) => ({ id, type, visibleIf: null, ...fields });

/** One block of every kind the plain-text rules treat differently, the footer last. */
export const RICH_BLOCKS = [
  block("h", "hero", { imageUrl: "https://img.example.com/a.png", alt: "Hero alt" }),
  block("hd", "heading", { text: "Hello {{customer.name}}", align: "left", size: 24 }),
  block("p", "paragraph", { text: "Line one\nLine two", align: "center" }),
  block("c", "code", { text: "123456" }),
  block("l", "list", { source: "items", labelPath: "name", valuePath: "price" }),
  block("t", "total", { label: "Total", value: "{{total}}" }),
  block("bt", "button", { text: "Pay now", href: "https://pay.example.com/{{order}}", align: "left" }),
  block("d", "divider", {}),
  block("f", "footer", { text: "Acme Ltd", unsubscribeLabel: "Unsubscribe", preferencesLabel: "Preferences" }),
];

export const RICH_VARIABLES = {
  customer: { name: "Sofie" },
  order: "A9",
  total: "48.00",
  items: [{ name: "Pro", price: "10.00" }, { name: "Plus", price: "38.00" }],
  unsubscribeUrl: "https://app.example.com/unsub/1",
  preferencesUrl: "https://app.example.com/prefs",
};

/**
 * Declares the rich marketing template in English and French.
 *
 * @param {Ctx} ctx The journey
 * @param {string} slug The slug
 * @param {Record<string, unknown>[]} [blocks] The blocks of both languages
 * @returns {Promise<{ id: string, slug: string }>} The template
 */
export function declareRich(ctx, slug, blocks = RICH_BLOCKS) {
  return declareLive(ctx, slug, {
    category: "marketing",
    locales: { en: { subject: "Rich {{order}}", preheader: "Pre header", blocks }, fr: { subject: "Riche {{order}}", preheader: "Pre en-tete", blocks } },
    variables: [],
  });
}

/**
 * Sends the template and reads what the mail sink received.
 *
 * @param {Ctx} ctx The journey
 * @param {string} slug The template
 * @param {string} name The recipient's local part
 * @param {Record<string, unknown>} [params] More send parameters
 * @returns {Promise<{ result: unknown, subject: string, contentType: string, parts: { type: string, text: string }[], plain: string, html: string }>} The message
 */
export async function sentMessage(ctx, slug, name, params = {}) {
  const to = ctx.email(name);
  const sent = await sendCode(ctx, `send to ${name}`, slug, { to, variables: RICH_VARIABLES, ...params });
  const arrived = await ctx.mail((message) => message.to.some((address) => address.includes(to)));
  if (!arrived.match) return { result: sent.result, subject: "", contentType: "", parts: [], plain: "", html: "" };
  const parts = partsOf(arrived.match);
  return {
    result: sent.result,
    subject: subjectOfHead(parts.head),
    contentType: parts.contentType,
    parts: parts.parts,
    plain: (parts.parts.find((part) => part.type === "text/plain")?.text ?? "").replace(/\r/g, ""),
    html: parts.parts.find((part) => part.type === "text/html")?.text ?? "",
  };
}

/**
 * @param {string} html An e-mail's HTML
 * @param {string[]} fragments Fragments that must appear in this order
 * @returns {boolean} Whether each is found after the previous one
 */
export function inOrder(html, fragments) {
  let from = 0;
  for (const fragment of fragments) {
    const at = html.indexOf(fragment, from);
    if (at < 0) return false;
    from = at + fragment.length;
  }
  return true;
}
