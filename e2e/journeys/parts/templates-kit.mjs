import { check, calling, list, mailing, pick, text } from "../../mailing.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */
/** @typedef {import("../../mailing.mjs").Answer} Answer */

export const TABLE = "/api/mailing/tables/templates";

/**
 * A request to the templates table, which the gallery and the dashboard call.
 *
 * @param {Ctx} ctx The journey
 * @param {string} label What the call does
 * @param {string} method The HTTP method
 * @param {string} path The path under the table
 * @param {unknown} [body] The JSON body
 * @returns {Promise<Answer>} The answer
 */
export function table(ctx, label, method, path, body) {
  return ctx.api(label, { method, path: `${TABLE}${path}`, body });
}

/**
 * Creates a template through the table's `new` route.
 *
 * @param {Ctx} ctx The journey
 * @param {Record<string, unknown>} fields The slug, name and the rest
 * @returns {Promise<{ answer: Answer, id: string }>} The answer and the id, empty when refused
 */
export async function created(ctx, fields) {
  const answer = await table(ctx, `create ${String(fields.slug)}`, "POST", "/new", fields);
  return { answer, id: text(answer.body, "_id") };
}

/**
 * @param {string} subject The subject
 * @returns {{ locales: { en: { subject: string, preheader: string, blocks: unknown[] } } }} Content with one English locale and no blocks
 */
export function content(subject) {
  return { locales: { en: { subject, preheader: "", blocks: [] } } };
}

/**
 * Saves a draft and returns the answer.
 *
 * @param {Ctx} ctx The journey
 * @param {string} id The template
 * @param {unknown} body The content body
 * @returns {Promise<Answer>} The answer
 */
export function save(ctx, id, body) {
  return mailing(ctx, "save the draft", "POST", `/templates/${id}/content`, { body });
}

/**
 * Creates a template, saves a draft with one English subject and publishes it.
 *
 * @param {Ctx} ctx The journey
 * @param {string} slug The slug
 * @returns {Promise<string>} The template id
 */
export async function live(ctx, slug) {
  const { id } = await created(ctx, { slug, name: slug, category: "orders" });
  await save(ctx, id, { content: content(`Subject of ${slug}`) });
  const published = await mailing(ctx, `publish ${slug}`, "POST", `/templates/${id}/publish`, { body: {} });
  await ctx.verify(`${slug} is live`, [check("publish answers 200", published.status === 200, published.body)], { critical: true });
  return id;
}

/**
 * The status of a refusal: a body that names an error key.
 *
 * @param {Answer} answer The answer
 * @param {number} status The status wanted
 * @param {string} key The error key the body must name (without the prefix)
 * @returns {import("../../mailing.mjs").Check} The check
 */
export function refused(answer, status, key) {
  const body = JSON.stringify(answer.body) ?? "";
  return check(`${status} ${key}`, answer.status === status && body.includes(key), `${answer.status} ${body.slice(0, 200)}`);
}

export { calling, list, mailing, pick, text };
