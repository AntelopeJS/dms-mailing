import { calling, check, isRow, mailing, pick, TENANT } from "../../mailing.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */
/** @typedef {import("../../mailing.mjs").Row} Row */

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

/**
 * @param {number} days How many days back
 * @param {number} [hours] Extra hours back
 * @returns {{ $date: string }} The date as the fixture revives it
 */
export function ago(days, hours = 0) {
  return { $date: new Date(Date.now() - days * DAY_MS - hours * HOUR_MS).toISOString() };
}

/**
 * @param {{ $date: string }} when A fixture date
 * @param {number} minutes Minutes later
 * @returns {{ $date: string }} The later date
 */
export function after(when, minutes) {
  return { $date: new Date(new Date(when.$date).getTime() + minutes * 60_000).toISOString() };
}

/**
 * Declares live templates through the interface.
 *
 * @param {Ctx} ctx The journey
 * @param {{ slug: string, name?: string, category?: string, locales?: string[] }[]} templates What to declare
 * @returns {Promise<void>}
 */
export async function declareTemplates(ctx, templates) {
  for (const template of templates) {
    const locales = Object.fromEntries((template.locales ?? ["en"]).map((code) => [code, { subject: `Subject ${template.slug} ${code}`, preheader: "", blocks: [] }]));
    const declaration = { tenantId: TENANT, slug: template.slug, name: { en: template.name ?? template.slug }, content: { locales } };
    if (template.category) declaration.category = template.category;
    const declared = await calling(ctx, `declare ${template.slug}`, "template", [declaration]);
    await ctx.verify(`${template.slug} is declared`, [check("the declaration is created", declared.ok && pick(declared.result, "outcome") === "created", declared.error ?? declared.result)], { critical: true });
  }
}

/**
 * Declares the settings categories the journeys use.
 *
 * @param {Ctx} ctx The journey
 * @param {string[]} ids The category ids
 * @returns {Promise<void>}
 */
export async function declareCategories(ctx, ids) {
  for (const id of ids) {
    await calling(ctx, `declare category ${id}`, "category", [{ tenantId: TENANT, id, label: { en: id }, icon: "i-ph-tag" }]);
  }
}

/**
 * One imported send.
 *
 * @param {string} key The import key
 * @param {string} slug The template
 * @param {string} to The address
 * @param {{ $date: string }} sentAt When
 * @param {{ type: string, minutes?: number, details?: Row }[]} [events] What the provider reported, `minutes` after the send
 * @returns {Row} The entry
 */
export function sendOf(key, slug, to, sentAt, events = []) {
  const entry = { importId: key, templateSlug: slug, to, sentAt, events: [] };
  entry.events = events.map((event, index) => {
    const at = after(sentAt, event.minutes ?? index + 1);
    return event.details ? { type: event.type, at, details: event.details } : { type: event.type, at };
  });
  return entry;
}

/**
 * The same as `sendOf`, for a test send.
 *
 * @param {string} key The import key
 * @param {string} slug The template
 * @param {string} to The address
 * @param {{ $date: string }} sentAt When
 * @param {{ type: string, minutes?: number, details?: Row }[]} [events] What the provider reported
 * @returns {Row} The entry
 */
export function testOf(key, slug, to, sentAt, events = []) {
  return { ...sendOf(key, slug, to, sentAt, events), isTest: true };
}

/**
 * An import entry with more fields (`locale`, `source`, `variables`, `provider`).
 *
 * @param {Row} entry An entry
 * @param {Row} more The fields to add
 * @returns {Row} The entry with them
 */
export function withFields(entry, more) {
  return { ...entry, ...more };
}

/**
 * Imports sends and checks the count.
 *
 * @param {Ctx} ctx The journey
 * @param {string} label What the batch is
 * @param {Row[]} sends The entries
 * @returns {Promise<string[]>} The send ids, in order
 */
export async function importSends(ctx, label, sends) {
  const done = await calling(ctx, `import ${label}`, "import", [{ tenantId: TENANT, sends }]);
  await ctx.verify(`${label} imported`, [check(`${sends.length} sends imported`, done.ok && pick(done.result, "imported") === sends.length, done.error ?? done.result)], { critical: true });
  const ids = pick(done.result, "sendIds");
  return Array.isArray(ids) ? ids.map(String) : [];
}

/**
 * The query string of a window `days` long ending now, optionally compared.
 *
 * @param {number} days The window length
 * @param {string} [comparison] `previous-period` (default), `previous-year` or `none`
 * @param {{ end?: Date }} [options] Another end
 * @returns {string} The query string, with its leading `?`
 */
export function windowQuery(days, comparison = "previous-period", options = {}) {
  const to = options.end ?? new Date();
  const from = new Date(to.getTime() - days * DAY_MS);
  return `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&comparison=${comparison}`;
}

/**
 * GETs a metrics route.
 *
 * @param {Ctx} ctx The journey
 * @param {string} path The path under `/metrics`, with its query
 * @returns {Promise<unknown>} The body
 */
export async function metric(ctx, path) {
  const answer = await mailing(ctx, `GET metrics ${path.slice(0, 60)}`, "GET", `/metrics${path}`);
  return answer.status === 200 ? answer.body : { status: answer.status, body: answer.body };
}

/**
 * @param {unknown} body A KPI answer
 * @returns {unknown[]} Value, previousValue, delta
 */
export function figure(body) {
  return ["value", "previousValue", "delta"].map((key) => (isRow(body) && key in body ? body[key] : "absent"));
}
