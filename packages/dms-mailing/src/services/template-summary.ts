import { GetModel } from "@antelopejs/interface-database-decorators";
import { LOCALE_LIST_SEPARATOR } from "../constants";
import { type MailingTemplate, TemplateModel } from "../db";
import type {
  TemplateAttentionReason,
  TemplateStatus,
  VariableDefinition,
} from "../types";
import { readSettings } from "./settings";
import { storedAttentionReasons } from "./template-attention";
import { hasDraft, parseVariables, publishedVersionOf } from "./templates";

/** What a procedure reads of a template before sending it. */
export interface TemplateSummary {
  templateId: string;
  name: string;
  category: string;
  status: TemplateStatus;
  publishedVersion: number;
  publishedAt?: Date;
  hasDraft: boolean;
  locales: string[];
  variables: VariableDefinition[];
  attention: TemplateAttentionReason[];
}

const localesOfColumn = (template: MailingTemplate): string[] =>
  (template.locales ?? "")
    .split(LOCALE_LIST_SEPARATOR)
    .filter((locale) => locale.length > 0);

/**
 * The template holding `slug`, its name in `locale` (else in the tenant's
 * fallback language) and its published variable contract; absent when no
 * template has the slug. Reads only.
 */
export async function templateSummaryOf(
  tenantId: string,
  slug: string,
  locale: string | undefined,
): Promise<TemplateSummary | undefined> {
  const template = await GetModel(TemplateModel, tenantId).getBySlug(slug);
  if (!template) return undefined;
  const nameLocale = locale || (await readSettings(tenantId)).fallbackLocale;
  return {
    templateId: template._id,
    name: TemplateModel.nameIn(template, nameLocale),
    category: template.category ?? "",
    status: template.status,
    publishedVersion: publishedVersionOf(template),
    publishedAt: template.publishedAt,
    hasDraft: hasDraft(template),
    locales: localesOfColumn(template),
    variables: parseVariables(template),
    attention: storedAttentionReasons(template),
  };
}
