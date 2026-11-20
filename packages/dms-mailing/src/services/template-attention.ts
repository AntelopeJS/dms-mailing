import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  type MailingTemplate,
  SendModel,
  type TemplateAttentionFields,
  TemplateModel,
} from "../db";
import type { TemplateAttentionReason } from "../types";
import {
  knownLocalesOf,
  type TemplateAttentionContext,
  templateAttentionReasons,
} from "./attention";
import { statsWindowStart } from "./metrics";

/** How the stored `attention` field separates its reasons. */
const REASON_SEPARATOR = ",";

const TEMPLATE_ATTENTION_REASONS: TemplateAttentionReason[] = [
  "stale_draft",
  "never_sent",
  "missing_locale",
];

const isAttentionReason = (value: string): value is TemplateAttentionReason =>
  TEMPLATE_ATTENTION_REASONS.some((reason) => reason === value);

/** The reasons a template's stored `attention` field names. */
export function storedAttentionReasons(
  template: Pick<MailingTemplate, "attention">,
): TemplateAttentionReason[] {
  return template.attention.split(REASON_SEPARATOR).filter(isAttentionReason);
}

/** A template that needs a look, and why. */
export type TemplateNeedingAttention = {
  templateId: string;
  slug: string;
  status: MailingTemplate["status"];
  reasons: TemplateAttentionReason[];
};

/** The templates needing a look, by slug, and how many matched before the cap. */
export interface TemplatesNeedingAttention {
  templates: TemplateNeedingAttention[];
  count: number;
}

/**
 * The tenant's templates whose stored attention names one of `reasons` (any
 * reason when empty), by slug, at most `limit` of them. Reads the fields the
 * refresh stored: no refresh, no write.
 */
export async function templatesNeedingAttention(
  tenantId: string,
  reasons: TemplateAttentionReason[],
  limit: number,
): Promise<TemplatesNeedingAttention> {
  const flagged = await GetModel(
    TemplateModel,
    tenantId,
  ).listNeedingAttention();
  const matching = flagged
    .map((template) => ({
      templateId: template._id,
      slug: template.slug,
      status: template.status,
      reasons: storedAttentionReasons(template),
    }))
    .filter(
      (entry) =>
        entry.reasons.length > 0 &&
        (!reasons.length || entry.reasons.some((r) => reasons.includes(r))),
    )
    .sort((left, right) => left.slug.localeCompare(right.slug));
  return { templates: matching.slice(0, limit), count: matching.length };
}

/** The attention fields a template gets for its reasons. */
function attentionFields(
  reasons: TemplateAttentionReason[],
): TemplateAttentionFields {
  return {
    attention: reasons.join(REASON_SEPARATOR),
    needsAttention: reasons.length > 0,
  };
}

async function attentionContext(
  tenantId: string,
  templates: MailingTemplate[],
): Promise<TemplateAttentionContext> {
  const now = Date.now();
  const slugs = await GetModel(SendModel, tenantId).listSentSlugs(
    statsWindowStart(now),
    new Date(now),
  );
  return {
    now,
    sentSlugs: new Set(slugs),
    knownLocales: knownLocalesOf(templates),
  };
}

/**
 * Works out again why each template of the tenant needs a look, and stores it
 * on the ones whose reasons changed: the templates page filters its "Needs
 * attention" tab on it and the cards show it.
 */
export async function refreshTemplateAttention(
  tenantId: string,
): Promise<void> {
  const model = GetModel(TemplateModel, tenantId);
  const templates = await model.getAll();
  const context = await attentionContext(tenantId, templates);
  const changed = templates
    .map((template) => ({
      template,
      fields: attentionFields(templateAttentionReasons(template, context)),
    }))
    .filter(({ template, fields }) => template.attention !== fields.attention);
  await Promise.all(
    changed.map(({ template, fields }) =>
      model.writeAttention(template._id, fields),
    ),
  );
}

/**
 * Refreshes the tenant's attention when `template` was flagged for `reason`,
 * which the write just made may have settled (a stale draft saved, a live
 * template sent).
 */
export async function refreshAttentionIfFlagged(
  tenantId: string,
  template: Pick<MailingTemplate, "attention">,
  reason: TemplateAttentionReason,
): Promise<void> {
  if (template.attention.split(REASON_SEPARATOR).includes(reason))
    await refreshTemplateAttention(tenantId);
}
