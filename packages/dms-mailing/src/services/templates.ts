import { randomUUID } from "node:crypto";
import { HTTPResult } from "@antelopejs/interface-api";
import { IsDuplicateKeyError } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  HTTP_CONFLICT,
  HTTP_NOT_FOUND,
  LOCALE_LIST_SEPARATOR,
} from "../constants";
import {
  type MailingTemplate,
  type MailingTemplateVersion,
  type TemplateFields,
  TemplateModel,
  TemplateVersionModel,
} from "../db";
import { diffContents, diffVariables, type TemplateChange } from "../engine";
import {
  refreshAttentionIfFlagged,
  refreshTemplateAttention,
} from "./template-attention";
import type {
  Block,
  LocaleContent,
  TemplateAttentionReason,
  TemplateContent,
  VariableDefinition,
} from "../types";
import { DEFAULT_FALLBACK_LOCALE } from "../types";

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
const STALE_DRAFT: TemplateAttentionReason = "stale_draft";
const VERSION_NOT_FOUND = "$dms_mailing.errors.version_not_found";
const TEMPLATE_NOT_FOUND = "$dms_mailing.errors.template_not_found";
const DUPLICATE_SLUG = "$dms_mailing.errors.duplicate_slug";
const SLUG_FIELD = "slug";

/** The template `id` names; 404 when there is none. */
export async function requireTemplate(
  model: TemplateModel,
  id: string,
): Promise<MailingTemplate> {
  const template = await model.get(id);
  if (!template) throw new HTTPResult(HTTP_NOT_FOUND, TEMPLATE_NOT_FOUND);
  return template;
}

/**
 * Runs a write that gives a template its slug, refused with a 409 when
 * another template of the tenant holds it: the slug's unique index settles
 * concurrent creations, so nothing reads the table before writing.
 */
export async function refuseTakenSlug<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (error) {
    if (IsDuplicateKeyError(error) && error.fields.includes(SLUG_FIELD))
      throw new HTTPResult(HTTP_CONFLICT, DUPLICATE_SLUG);
    throw error;
  }
}

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
  return JSON.parse(template.json_variables) as VariableDefinition[];
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

/** A snapshot and the version it belongs to; 0 for a draft. */
export interface VersionedSnapshot extends TemplateDraft {
  version: number;
}

/** What a publish would ship: the draft's content and declarations. */
export const workingSnapshot = (template: MailingTemplate): TemplateDraft => ({
  content: workingContent(template),
  variables: workingVariables(template),
});

/** What customers receive: the published content and declarations. */
export const publishedSnapshot = (
  template: MailingTemplate,
): TemplateDraft => ({
  content: parseContent(template),
  variables: parseVariables(template),
});

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
  return JSON.parse(template.json_test_data) as Record<string, unknown>;
}

interface FooterLabels {
  unsubscribe: string;
  preferences: string;
}

const ENGLISH_FOOTER_LABELS: FooterLabels = {
  unsubscribe: "Unsubscribe",
  preferences: "Preferences",
};

/**
 * The one piece of content the module still writes for a new template. An
 * e-mail without an unsubscribe link is a legal problem, so a blank template
 * ships a footer — and nothing else: no invented subject, prose or address.
 */
const FOOTER_LABELS = new Map<string, FooterLabels>([
  ["en", ENGLISH_FOOTER_LABELS],
  ["fr", { unsubscribe: "Se désinscrire", preferences: "Préférences" }],
]);

const FOOTER_BLOCK_ID = "footer";

/** A footer in `locale`: its legal line and the labels of its two links. */
export function footerBlock(locale: string, text = ""): Block {
  const labels = FOOTER_LABELS.get(locale) ?? ENGLISH_FOOTER_LABELS;
  return {
    id: FOOTER_BLOCK_ID,
    type: "footer",
    text,
    unsubscribeLabel: labels.unsubscribe,
    preferencesLabel: labels.preferences,
    visibleIf: null,
  };
}

export function blankContent(locale: string): TemplateContent {
  return {
    locales: {
      [locale]: { subject: "", preheader: "", blocks: [footerBlock(locale)] },
    },
  };
}

const FIRST_DRAFT_REVISION = 0;

/** A new template needs no look until the attention refresh says so. */
const NO_ATTENTION = { attention: "", needsAttention: false };

/** Whether a writer that last saw `revision` is behind the stored draft. */
export function isStaleRevision(
  template: MailingTemplate,
  revision: number | undefined,
): boolean {
  return revision !== undefined && revision !== template.draftRevision;
}

function draftWriteFields(template: MailingTemplate, author: string) {
  return {
    draftRevision: template.draftRevision + 1,
    draftUpdatedAt: new Date(),
    draftUpdatedBy: author,
    updatedBy: author,
  } satisfies TemplateFields;
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
  await GetModel(TemplateModel, tenantId).updateFields(template._id, {
    json_draft: isClean ? "" : JSON.stringify(content),
    json_variables_draft: isClean ? "" : JSON.stringify(variables),
    isDraftPending: !isClean,
    ...fields,
    ...locales,
  });
  await refreshAttentionIfFlagged(tenantId, template, STALE_DRAFT);
  return fields.draftRevision;
}

export async function discardDraft(
  tenantId: string,
  template: MailingTemplate,
  author: string,
): Promise<void> {
  await GetModel(TemplateModel, tenantId).updateFields(template._id, {
    json_draft: "",
    json_variables_draft: "",
    isDraftPending: false,
    ...draftWriteFields(template, author),
  });
}

/** What a published version changed from the one before. */
export function parseVersionChanges(
  row: MailingTemplateVersion,
): TemplateChange[] {
  return JSON.parse(row.json_changes) as TemplateChange[];
}

/** The declarations a published version shipped with. */
export function parseVersionVariables(
  row: MailingTemplateVersion,
): VariableDefinition[] {
  return JSON.parse(row.json_variables) as VariableDefinition[];
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
 * Publishes a snapshot in one conditional write, including declaration
 * metadata when supplied. A losing writer never inserts speculative history.
 * The latest version is recoverable from the template after a failed history
 * insert; before replacing it we must materialize the previous version.
 */
export async function publishSnapshot(
  tenantId: string,
  template: MailingTemplate,
  draft: TemplateDraft,
  author: string,
  metadata: TemplateFields = {},
): Promise<PublishOutcome | undefined> {
  const previous = publishedVersionOf(template);
  const changes = changesOf(template, draft);
  const isUnchanged = previous > NEVER_PUBLISHED && changes.length === 0;
  const version = isUnchanged ? previous : previous + 1;
  const versions = GetModel(TemplateVersionModel, tenantId);
  await versions.materialize(template);
  const shipped: TemplateFields = isUnchanged
    ? {}
    : {
        json_content: JSON.stringify(draft.content),
        json_variables: JSON.stringify(draft.variables),
        locales: localesOf(draft.content),
        publishedAt: new Date(),
        publishedBy: author,
      };
  const history = isUnchanged
    ? {}
    : {
        json_published_version: JSON.stringify({
          ...shipped,
          _id: randomUUID(),
          templateId: template._id,
          version,
          json_changes: JSON.stringify(changes),
        }),
      };
  const patch: TemplateFields = {
    ...metadata,
    ...shipped,
    ...history,
    json_draft: "",
    json_variables_draft: "",
    isDraftPending: false,
    draftRevision:
      template.draftRevision + Number(!isUnchanged || hasDraft(template)),
    status: "live",
    publishedVersion: version,
    publishedAt: shipped.publishedAt ?? template.publishedAt ?? new Date(),
    updatedBy: author,
  };
  if (
    !(await GetModel(TemplateModel, tenantId).publishIfCurrent(template, patch))
  )
    return undefined;
  await versions.materialize({
    json_published_version:
      patch.json_published_version ?? template.json_published_version,
  });
  await refreshTemplateAttention(tenantId);
  return { version, changes };
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
  const outcome = await publishSnapshot(
    tenantId,
    template,
    {
      content: workingContent(template),
      variables: workingVariables(template),
    },
    author,
  );
  if (!outcome)
    throw new HTTPResult(HTTP_CONFLICT, "$dms_mailing.errors.draft_conflict");
  return outcome;
}

/**
 * The content and declarations a send of `version` carried: the draft's for
 * a test of one.
 */
export async function snapshotOfVersion(
  tenantId: string,
  template: MailingTemplate,
  version: number,
): Promise<TemplateDraft> {
  if (!version) return workingSnapshot(template);
  const row = await GetModel(TemplateVersionModel, tenantId).getVersion(
    template._id,
    version,
  );
  if (!row) throw new HTTPResult(HTTP_NOT_FOUND, VERSION_NOT_FOUND);
  return {
    content: parseVersionContent(row),
    variables: parseVersionVariables(row),
  };
}

/** The content a send of `version` carried: the draft's for a test of one. */
export async function contentOfVersion(
  tenantId: string,
  template: MailingTemplate,
  version: number,
): Promise<TemplateContent> {
  return (await snapshotOfVersion(tenantId, template, version)).content;
}

export function parseVersionContent(
  row: MailingTemplateVersion,
): TemplateContent {
  return JSON.parse(row.json_content) as TemplateContent;
}

/**
 * The content-bearing fields of a template, for copying it onto another. The
 * copy starts as a draft of the source's working content: it was never
 * published, so customers receive nothing from it yet.
 */
export function contentFieldsOf(source: MailingTemplate): TemplateFields {
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
    draftRevision: FIRST_DRAFT_REVISION,
    ...NO_ATTENTION,
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
  fields: TemplateFields,
): Promise<void> {
  await GetModel(TemplateModel, tenantId).updateFields(templateId, {
    status: "draft",
    json_variables: "[]",
    json_test_data: "{}",
    ...fields,
    updatedBy: author,
  });
  await refreshTemplateAttention(tenantId);
}

/** The first version a template publishes. */
const FIRST_VERSION = 1;

/**
 * A new template, published at once as version 1 of `draft`: its content
 * and its history entry land in the one write that creates it, so no reader
 * ever sees it unpublished. Materialize its version row afterwards, as a
 * publication does.
 */
export function publishedAtCreation(
  id: string,
  draft: TemplateDraft,
  author: string,
): TemplateFields {
  const shipped: TemplateFields = {
    json_content: JSON.stringify(draft.content),
    json_variables: JSON.stringify(draft.variables),
    locales: localesOf(draft.content),
    publishedAt: new Date(),
    publishedBy: author,
  };
  const changes = [
    ...diffContents({ locales: {} }, draft.content),
    ...diffVariables([], draft.variables),
  ];
  return {
    _id: id,
    ...shipped,
    json_published_version: JSON.stringify({
      ...shipped,
      _id: randomUUID(),
      templateId: id,
      version: FIRST_VERSION,
      json_changes: JSON.stringify(changes),
    }),
    json_draft: "",
    json_variables_draft: "",
    isDraftPending: false,
    draftRevision: FIRST_DRAFT_REVISION,
    status: "live",
    publishedVersion: FIRST_VERSION,
    updatedBy: author,
    ...NO_ATTENTION,
  };
}

export function blankFields(content: TemplateContent): TemplateFields {
  return {
    json_content: "",
    json_draft: JSON.stringify(content),
    isDraftPending: true,
    locales: localesOf(content),
    publishedVersion: NEVER_PUBLISHED,
    draftRevision: FIRST_DRAFT_REVISION,
    ...NO_ATTENTION,
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
