import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_FALLBACK_LOCALE, LOCALE_LIST_SEPARATOR } from "../constants";
import { type MailingTemplate, TemplateModel } from "../db";
import type {
  Block,
  LocaleContent,
  TemplateContent,
  VariableDefinition,
} from "../types";

export interface TemplateAuthor {
  name?: string;
  email: string;
}

/** Locale codes a content tree carries, in the `locales` column's format. */
export function localesOf(content: TemplateContent): string {
  return Object.keys(content.locales).join(LOCALE_LIST_SEPARATOR);
}

export function parseContent(template: MailingTemplate): TemplateContent {
  return JSON.parse(
    template.json_content || '{"locales":{}}',
  ) as TemplateContent;
}

export function parseVariables(
  template: MailingTemplate,
): VariableDefinition[] {
  return JSON.parse(template.json_variables || "[]") as VariableDefinition[];
}

export function parseTestData(
  template: MailingTemplate,
): Record<string, unknown> {
  return JSON.parse(template.json_test_data || "{}") as Record<string, unknown>;
}

interface FooterLabels {
  unsubscribe: string;
  preferences: string;
}

/**
 * The one piece of content the module still writes for a new template. An
 * e-mail without an unsubscribe link is a legal problem, so a blank template
 * ships a footer — and nothing else: no invented subject, prose or address.
 */
const FOOTER_LABELS: Record<string, FooterLabels> = {
  en: { unsubscribe: "Unsubscribe", preferences: "Preferences" },
  fr: { unsubscribe: "Se désinscrire", preferences: "Préférences" },
};

const FOOTER_BLOCK_ID = "footer";

export function blankContent(locale: string): TemplateContent {
  const labels = FOOTER_LABELS[locale] ?? (FOOTER_LABELS.en as FooterLabels);
  const footer: Block = {
    id: FOOTER_BLOCK_ID,
    type: "footer",
    text: "",
    unsubscribeLabel: labels.unsubscribe,
    preferencesLabel: labels.preferences,
    visibleIf: null,
  };
  return {
    locales: { [locale]: { subject: "", preheader: "", blocks: [footer] } },
  };
}

/**
 * The single writer of a template's content. Replaces it in place and keeps the
 * denormalised `locales` column in step; there is no version history.
 */
export async function saveContent(
  tenantId: string,
  templateId: string,
  content: TemplateContent,
  author: string,
): Promise<void> {
  await GetModel(TemplateModel, tenantId).update(templateId, {
    json_content: JSON.stringify(content),
    locales: localesOf(content),
    updatedBy: author,
  });
}

/** The content-bearing fields of a template, for copying it onto another. */
export function contentFieldsOf(
  source: MailingTemplate,
): Partial<MailingTemplate> {
  return {
    json_content: source.json_content,
    json_variables: source.json_variables,
    json_test_data: source.json_test_data,
    locales: source.locales,
  };
}

/**
 * Seeds a freshly created template: a copy of `source` when one was chosen,
 * the blank footer-only content otherwise.
 */
export async function initializeTemplate(
  tenantId: string,
  templateId: string,
  locale: string,
  author: string,
  source?: MailingTemplate,
): Promise<void> {
  const content = source
    ? contentFieldsOf(source)
    : blankFields(blankContent(locale));
  await GetModel(TemplateModel, tenantId).update(templateId, {
    status: "draft",
    json_variables: "[]",
    json_test_data: "{}",
    ...content,
    updatedBy: author,
  });
}

function blankFields(content: TemplateContent): Partial<MailingTemplate> {
  return {
    json_content: JSON.stringify(content),
    locales: localesOf(content),
  };
}

/**
 * The locale's content, or undefined when the template carries none. A template
 * whose content never landed must fail with a clear message, not a stack.
 */
export function localeContentOf(
  content: TemplateContent,
  locale: string,
): LocaleContent | undefined {
  return content.locales[locale];
}

export function pickLocale(
  content: TemplateContent,
  wanted: string | undefined,
  fallback: string,
): string {
  const available = Object.keys(content.locales);
  const candidates = [wanted, fallback, DEFAULT_FALLBACK_LOCALE, available[0]];
  return (
    candidates.find((locale): locale is string =>
      Boolean(locale && content.locales[locale]),
    ) ?? DEFAULT_FALLBACK_LOCALE
  );
}

export function displayName(user: TemplateAuthor): string {
  return user.name || user.email;
}
