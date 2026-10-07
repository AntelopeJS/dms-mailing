import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_FALLBACK_LOCALE, LOCALE_LIST_SEPARATOR } from "../constants";
import {
  type MailingTemplate,
  type MailingTemplateVersion,
  TemplateModel,
  TemplateVersionModel,
} from "../db";
import { diffContents, type TemplateChange } from "../engine";
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

const EMPTY_CONTENT = '{"locales":{}}';
const NEVER_PUBLISHED = 0;
const FIRST_VERSION = 1;

/** The content customers receive: the last published version. */
export function parseContent(template: MailingTemplate): TemplateContent {
  return JSON.parse(template.json_content || EMPTY_CONTENT) as TemplateContent;
}

export function hasDraft(template: MailingTemplate): boolean {
  return Boolean(template.json_draft);
}

/** The content the editor works on: the draft, or the published content. */
export function workingContent(template: MailingTemplate): TemplateContent {
  if (!template.json_draft) return parseContent(template);
  return JSON.parse(template.json_draft) as TemplateContent;
}

/**
 * The version customers receive. Rows written before versions existed carry
 * no number: a template that was ever published reads as v1.
 */
export function publishedVersionOf(template: MailingTemplate): number {
  if (typeof template.publishedVersion === "number")
    return template.publishedVersion;
  const wasPublished = template.status === "live" || !!template.publishedAt;
  return wasPublished ? FIRST_VERSION : NEVER_PUBLISHED;
}

export function isPublished(template: MailingTemplate): boolean {
  return publishedVersionOf(template) > NEVER_PUBLISHED;
}

/**
 * What the draft would change for customers. A template never published has
 * nothing to compare against: every locale of its draft is new.
 */
export function pendingChanges(template: MailingTemplate): TemplateChange[] {
  if (!hasDraft(template)) return [];
  const published = isPublished(template)
    ? parseContent(template)
    : { locales: {} };
  return diffContents(published, workingContent(template));
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
 * The single writer of the editor's content: it lands in the draft, never in
 * what customers receive. A template never published keeps its `locales`
 * column on the draft, so the gallery shows what the draft covers.
 */
export async function saveDraft(
  tenantId: string,
  template: MailingTemplate,
  content: TemplateContent,
  author: string,
): Promise<void> {
  const locales = isPublished(template) ? {} : { locales: localesOf(content) };
  await GetModel(TemplateModel, tenantId).update(template._id, {
    json_draft: JSON.stringify(content),
    isDraftPending: true,
    draftUpdatedAt: new Date(),
    draftUpdatedBy: author,
    updatedBy: author,
    ...locales,
  });
}

export async function discardDraft(
  tenantId: string,
  template: MailingTemplate,
  author: string,
): Promise<void> {
  const locales = isPublished(template)
    ? {}
    : { locales: localesOf(parseContent(template)) };
  await GetModel(TemplateModel, tenantId).update(template._id, {
    json_draft: "",
    isDraftPending: false,
    draftUpdatedBy: author,
    updatedBy: author,
    ...locales,
  });
}

export interface PublishOutcome {
  version: number;
  changes: TemplateChange[];
}

/**
 * Ships the working content: it becomes what `SendTemplate` sends, a version
 * row keeps it for the history, and the draft is cleared. Re-publishing an
 * unpublished template with no draft makes it live again without a version.
 */
export async function publishTemplate(
  tenantId: string,
  template: MailingTemplate,
  author: string,
): Promise<PublishOutcome> {
  const previous = publishedVersionOf(template);
  if (!hasDraft(template) && previous > NEVER_PUBLISHED) {
    await markLive(tenantId, template, previous, author);
    return { version: previous, changes: [] };
  }
  const content = workingContent(template);
  const changes = pendingChanges(template);
  const version = previous + 1;
  await GetModel(TemplateVersionModel, tenantId).insert({
    templateId: template._id,
    version,
    json_content: JSON.stringify(content),
    json_variables: template.json_variables || "[]",
    locales: localesOf(content),
    publishedAt: new Date(),
    publishedBy: author,
    json_changes: JSON.stringify(changes),
  });
  await GetModel(TemplateModel, tenantId).update(template._id, {
    json_content: JSON.stringify(content),
    json_draft: "",
    isDraftPending: false,
    locales: localesOf(content),
    status: "live",
    publishedVersion: version,
    publishedAt: new Date(),
    publishedBy: author,
    updatedBy: author,
  });
  return { version, changes };
}

async function markLive(
  tenantId: string,
  template: MailingTemplate,
  version: number,
  author: string,
): Promise<void> {
  await GetModel(TemplateModel, tenantId).update(template._id, {
    status: "live",
    publishedVersion: version,
    publishedAt: template.publishedAt ?? new Date(),
    updatedBy: author,
  });
}

/**
 * The content a send of `version` carried. Versions published before the
 * history existed have no row: the template's current content stands in.
 */
export async function contentOfVersion(
  tenantId: string,
  template: MailingTemplate,
  version: number | undefined,
): Promise<TemplateContent> {
  if (!version) return workingContent(template);
  const row = await GetModel(TemplateVersionModel, tenantId).getVersion(
    template._id,
    version,
  );
  return row ? parseVersionContent(row) : parseContent(template);
}

export function parseVersionContent(
  row: MailingTemplateVersion,
): TemplateContent {
  return JSON.parse(row.json_content || EMPTY_CONTENT) as TemplateContent;
}

/**
 * The content-bearing fields of a template, for copying it onto another. The
 * copy starts as a draft of the source's working content: it was never
 * published, so customers receive nothing from it yet.
 */
export function contentFieldsOf(
  source: MailingTemplate,
): Partial<MailingTemplate> {
  const content = workingContent(source);
  return {
    json_content: "",
    json_draft: JSON.stringify(content),
    isDraftPending: true,
    json_variables: source.json_variables,
    json_test_data: source.json_test_data,
    locales: localesOf(content),
    publishedVersion: NEVER_PUBLISHED,
  };
}

/**
 * Seeds a freshly created template with the content fields its creation
 * picked: a copy of another template, a starter, or the blank footer-only page.
 */
export async function initializeTemplate(
  tenantId: string,
  templateId: string,
  author: string,
  fields: Partial<MailingTemplate>,
): Promise<void> {
  await GetModel(TemplateModel, tenantId).update(templateId, {
    status: "draft",
    json_variables: "[]",
    json_test_data: "{}",
    ...fields,
    updatedBy: author,
  });
}

export function blankTemplateFields(locale: string): Partial<MailingTemplate> {
  return blankFields(blankContent(locale));
}

export function blankFields(
  content: TemplateContent,
): Partial<MailingTemplate> {
  return {
    json_content: "",
    json_draft: JSON.stringify(content),
    isDraftPending: true,
    locales: localesOf(content),
    publishedVersion: NEVER_PUBLISHED,
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
