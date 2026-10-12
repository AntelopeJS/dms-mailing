import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  DEFAULT_FALLBACK_LOCALE,
  HTTP_NOT_FOUND,
  LOCALE_LIST_SEPARATOR,
} from "../constants";
import {
  type MailingTemplate,
  type MailingTemplateVersion,
  TemplateModel,
  TemplateVersionModel,
} from "../db";
import { diffContents, diffVariables, type TemplateChange } from "../engine";
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
const VERSION_NOT_FOUND = "$dms_mailing.errors.version_not_found";

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

/** The version customers receive; 0 for a template never published. */
export function publishedVersionOf(template: MailingTemplate): number {
  return template.publishedVersion;
}

export function isPublished(template: MailingTemplate): boolean {
  return publishedVersionOf(template) > NEVER_PUBLISHED;
}

/**
 * The published variable declarations: the contract real sends are checked
 * against. A template never published carries those it was created with.
 */
export function parseVariables(
  template: MailingTemplate,
): VariableDefinition[] {
  return JSON.parse(template.json_variables || "[]") as VariableDefinition[];
}

/**
 * The declarations the editor works on: the draft's, else the published
 * ones. A copy starts with a draft that declares the published ones.
 */
export function workingVariables(
  template: MailingTemplate,
): VariableDefinition[] {
  if (!hasDraft(template) || !template.json_variables_draft)
    return parseVariables(template);
  return JSON.parse(template.json_variables_draft) as VariableDefinition[];
}

/** A template's working state: what a publish would ship. */
export interface TemplateDraft {
  content: TemplateContent;
  variables: VariableDefinition[];
}

/**
 * What `draft` would change for customers and for the callers' contract. A
 * template never published has nothing to compare against: every locale and
 * every declaration of its draft is new.
 */
function changesOf(
  template: MailingTemplate,
  draft: TemplateDraft,
): TemplateChange[] {
  const wasPublished = isPublished(template);
  const published = wasPublished ? parseContent(template) : { locales: {} };
  const declared = wasPublished ? parseVariables(template) : [];
  return [
    ...diffContents(published, draft.content),
    ...diffVariables(declared, draft.variables),
  ];
}

/** What the draft would change for customers and for callers. */
export function pendingChanges(template: MailingTemplate): TemplateChange[] {
  if (!hasDraft(template)) return [];
  return changesOf(template, {
    content: workingContent(template),
    variables: workingVariables(template),
  });
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

const FIRST_DRAFT_REVISION = 0;

/**
 * The draft's revision: every write of `json_draft` (a save, a discard, a
 * publish) moves it on, so a writer holding an older one knows it would
 * overwrite changes it never saw.
 */
export function draftRevisionOf(template: MailingTemplate): number {
  return template.draftRevision ?? FIRST_DRAFT_REVISION;
}

/** Whether a writer that last saw `revision` is behind the stored draft. */
export function isStaleRevision(
  template: MailingTemplate,
  revision: number | undefined,
): boolean {
  return revision !== undefined && revision !== draftRevisionOf(template);
}

function draftWriteFields(
  template: MailingTemplate,
  author: string,
): Partial<MailingTemplate> {
  return {
    draftRevision: draftRevisionOf(template) + 1,
    draftUpdatedAt: new Date(),
    draftUpdatedBy: author,
    updatedBy: author,
  };
}

/** Whether `draft` is exactly what customers and callers already have. */
function isPublishedDraft(
  template: MailingTemplate,
  draft: TemplateDraft,
): boolean {
  return isPublished(template) && changesOf(template, draft).length === 0;
}

/**
 * The single writer of the editor's work: content and variable declarations
 * land in the draft, never in what customers receive or what callers are
 * checked against. A draft put back as it was published is no draft. A
 * template never published keeps its `locales` column on the draft, so the
 * gallery shows what the draft covers. Answers the draft's new revision.
 */
export async function saveDraft(
  tenantId: string,
  template: MailingTemplate,
  draft: TemplateDraft,
  author: string,
): Promise<number> {
  const { content, variables } = draft;
  const locales = isPublished(template) ? {} : { locales: localesOf(content) };
  const isClean = isPublishedDraft(template, draft);
  const fields = draftWriteFields(template, author);
  await GetModel(TemplateModel, tenantId).update(template._id, {
    json_draft: isClean ? "" : JSON.stringify(content),
    json_variables_draft: isClean ? "" : JSON.stringify(variables),
    isDraftPending: !isClean,
    ...fields,
    ...locales,
  });
  return fields.draftRevision as number;
}

export async function discardDraft(
  tenantId: string,
  template: MailingTemplate,
  author: string,
): Promise<void> {
  await GetModel(TemplateModel, tenantId).update(template._id, {
    json_draft: "",
    json_variables_draft: "",
    isDraftPending: false,
    ...draftWriteFields(template, author),
  });
}

/** The declarations a published version shipped with. */
export function parseVersionVariables(
  row: MailingTemplateVersion,
): VariableDefinition[] {
  return JSON.parse(row.json_variables || "[]") as VariableDefinition[];
}

/**
 * Copies a published version into the draft, declarations included: the
 * normal review and publish then apply. Restoring what customers already
 * receive leaves no draft. Answers the draft's new revision.
 */
export function restoreVersionAsDraft(
  tenantId: string,
  template: MailingTemplate,
  row: MailingTemplateVersion,
  author: string,
): Promise<number> {
  const draft = {
    content: parseVersionContent(row),
    variables: parseVersionVariables(row),
  };
  return saveDraft(tenantId, template, draft, author);
}

/** Locales whose subject is blank: a send would go out without one. */
export function localesWithoutSubject(content: TemplateContent): string[] {
  return Object.entries(content.locales)
    .filter(([, locale]) => !locale.subject.trim())
    .map(([code]) => code);
}

export interface PublishOutcome {
  version: number;
  changes: TemplateChange[];
}

/**
 * Ships the working content: it becomes what `SendTemplate` sends, a version
 * row keeps it for the history, and the draft is cleared. Re-publishing a
 * template whose draft changes nothing makes it live again without a version.
 */
export async function publishTemplate(
  tenantId: string,
  template: MailingTemplate,
  author: string,
): Promise<PublishOutcome> {
  const previous = publishedVersionOf(template);
  const changes = pendingChanges(template);
  if (previous > NEVER_PUBLISHED && changes.length === 0) {
    await markLive(tenantId, template, previous, author);
    return { version: previous, changes };
  }
  const content = workingContent(template);
  const variables = JSON.stringify(workingVariables(template));
  const version = previous + 1;
  await GetModel(TemplateVersionModel, tenantId).insert({
    templateId: template._id,
    version,
    json_content: JSON.stringify(content),
    json_variables: variables,
    locales: localesOf(content),
    publishedAt: new Date(),
    publishedBy: author,
    json_changes: JSON.stringify(changes),
  });
  await GetModel(TemplateModel, tenantId).update(template._id, {
    json_content: JSON.stringify(content),
    json_variables: variables,
    json_draft: "",
    json_variables_draft: "",
    isDraftPending: false,
    draftRevision: draftRevisionOf(template) + 1,
    locales: localesOf(content),
    status: "live",
    publishedVersion: version,
    publishedAt: new Date(),
    publishedBy: author,
    updatedBy: author,
  });
  return { version, changes };
}

/** Puts `version` back live; a draft equal to it is dropped on the way. */
async function markLive(
  tenantId: string,
  template: MailingTemplate,
  version: number,
  author: string,
): Promise<void> {
  const draft = hasDraft(template)
    ? {
        json_draft: "",
        json_variables_draft: "",
        isDraftPending: false,
        draftRevision: draftRevisionOf(template) + 1,
      }
    : {};
  await GetModel(TemplateModel, tenantId).update(template._id, {
    status: "live",
    publishedVersion: version,
    publishedAt: template.publishedAt ?? new Date(),
    updatedBy: author,
    ...draft,
  });
}

/** The content a send of `version` carried: the draft's for a test of one. */
export async function contentOfVersion(
  tenantId: string,
  template: MailingTemplate,
  version: number,
): Promise<TemplateContent> {
  if (!version) return workingContent(template);
  const row = await GetModel(TemplateVersionModel, tenantId).getVersion(
    template._id,
    version,
  );
  if (!row) throw new HTTPResult(HTTP_NOT_FOUND, VERSION_NOT_FOUND);
  return parseVersionContent(row);
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
    json_variables: JSON.stringify(workingVariables(source)),
    json_variables_draft: "",
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

const LOCALE_PART_SEPARATOR = /[-_]/;

/**
 * The codes a requested locale may match, most precise first: as asked, then
 * its base language ("fr-BE" and "FR" both reach "fr").
 */
function requestedCandidates(wanted: string | undefined): string[] {
  if (!wanted) return [];
  const [language = wanted] = wanted.split(LOCALE_PART_SEPARATOR);
  return [wanted, language];
}

/**
 * The locale a send renders: the requested one (matched regardless of case,
 * or by its base language), else the tenant fallback, else English, else
 * whatever the content carries.
 */
export function pickLocale(
  content: TemplateContent,
  wanted: string | undefined,
  fallback: string,
): string {
  const available = Object.keys(content.locales);
  const byCode = new Map(available.map((code) => [code.toLowerCase(), code]));
  const candidates = [
    ...requestedCandidates(wanted),
    fallback,
    DEFAULT_FALLBACK_LOCALE,
    available[0],
  ];
  const match = candidates
    .map((locale) => (locale ? byCode.get(locale.toLowerCase()) : undefined))
    .find((code): code is string => Boolean(code));
  return match ?? DEFAULT_FALLBACK_LOCALE;
}

export function displayName(user: TemplateAuthor): string {
  return user.name || user.email;
}
