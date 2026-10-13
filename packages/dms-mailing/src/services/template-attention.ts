import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  type MailingTemplate,
  SendModel,
  type TemplateAttentionFields,
  TemplateModel,
} from "../db";
import { BUSINESS_AUDIENCE, type TemplateAttentionReason } from "../types";
import {
  knownLocalesOf,
  type TemplateAttentionContext,
  templateAttentionReasons,
} from "./attention";
import { forAudience, statsWindowStart } from "./metrics";

/** How the stored `attention` field separates its reasons. */
const REASON_SEPARATOR = ",";

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
  const sends = await GetModel(SendModel, tenantId).listBetween(
    statsWindowStart(now),
    new Date(now),
  );
  const real = forAudience(sends, BUSINESS_AUDIENCE);
  return {
    now,
    sentSlugs: new Set(real.map((send) => send.templateSlug)),
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
