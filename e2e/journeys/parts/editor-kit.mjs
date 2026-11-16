import { mailing, pick, text } from "../../mailing.mjs";
import { created } from "./templates-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

/** A block's common fields. */
export const SHOWN = { visibleIf: null };

/**
 * Renders blocks with the template preview of the editor.
 *
 * @param {Ctx} ctx The journey
 * @param {string} id A template of the workspace
 * @param {{ blocks: unknown[], data?: Record<string, unknown>, locale?: string, subject?: string, preheader?: string, category?: string }} spec What to render
 * @returns {Promise<{ html: string, subject: string, missing: unknown, hidden: string[], status: number | null, locale: string }>} What the preview answered
 */
export async function render(ctx, id, spec) {
  const locale = spec.locale ?? "en";
  const answer = await mailing(ctx, "preview the blocks", "POST", `/templates/${id}/preview`, {
    body: {
      locale,
      data: spec.data ?? {},
      content: { locales: { [locale]: { subject: spec.subject ?? "Subject", preheader: spec.preheader ?? "", blocks: spec.blocks } } },
    },
  });
  const hidden = pick(answer.body, "hiddenBlockIds");
  return {
    html: text(answer.body, "html"),
    subject: text(answer.body, "subject"),
    missing: pick(answer.body, "missing"),
    hidden: Array.isArray(hidden) ? hidden.map(String) : [],
    status: answer.status,
    locale: text(answer.body, "locale"),
  };
}

/**
 * A scratch template to preview against.
 *
 * @param {Ctx} ctx The journey
 * @param {string} slug The slug
 * @returns {Promise<string>} Its id
 */
export async function scratch(ctx, slug) {
  const { id } = await created(ctx, { slug, name: slug, category: "orders" });
  return id;
}

/**
 * @param {string} html Rendered HTML
 * @returns {string} Its visible text, entities and tags removed, spaces collapsed
 */
export function plain(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[\s  ]+/g, " ")
    .trim();
}
