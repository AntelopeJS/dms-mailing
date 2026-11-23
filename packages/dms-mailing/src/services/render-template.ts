import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import type { TemplateVariables } from "@antelopejs/interface-dms-mailing";
import { type MailingTemplate, TemplateModel } from "../db";
import { renderPlainText, resolveEmail, valueFormatOf } from "../engine";
import { renderEmailHtml } from "./render";
import { SendError } from "./send-error";
import { readSettings } from "./settings";
import {
  localeContentOf,
  pickLocale,
  publishedSnapshot,
  publishedVersionOf,
  snapshotOfVersion,
  type VersionedSnapshot,
  workingSnapshot,
} from "./templates";

/** Which content to render: the published one, the draft, or one past version. */
type RenderedVersion = "published" | "draft" | number;

export interface RenderTemplateOptions {
  locale?: string;
  variables?: TemplateVariables;
  version?: RenderedVersion;
}

/** A template rendered as a send delivers it, nothing sent or stored. */
export interface RenderedTemplate {
  subject: string;
  preheader: string;
  html: string;
  text: string;
  locale: string;
  /** Version rendered; 0 for the draft. */
  version: number;
  /** Variable paths no value was given for. */
  missing: string[];
}

const DRAFT_VERSION = 0;

/** The content a real send delivers: refused, as a send is, unless live. */
function requirePublished(template: MailingTemplate): VersionedSnapshot {
  if (template.status !== "live")
    throw new SendError(
      "template_not_live",
      `Template "${template.slug}" is ${template.status}`,
    );
  return {
    ...publishedSnapshot(template),
    version: publishedVersionOf(template),
  };
}

async function pastVersion(
  tenantId: string,
  template: MailingTemplate,
  version: number,
): Promise<VersionedSnapshot> {
  try {
    return {
      ...(await snapshotOfVersion(tenantId, template, version)),
      version,
    };
  } catch (error) {
    if (!(error instanceof HTTPResult)) throw error;
    throw new SendError(
      "version_not_found",
      `Template "${template.slug}" has no version ${version}`,
    );
  }
}

function snapshotToRender(
  tenantId: string,
  template: MailingTemplate,
  version: RenderedVersion,
): VersionedSnapshot | Promise<VersionedSnapshot> {
  if (version === "published") return requirePublished(template);
  if (version === "draft")
    return { ...workingSnapshot(template), version: DRAFT_VERSION };
  return pastVersion(tenantId, template, version);
}

/**
 * Renders a template's published content, its draft or one past version
 * with the values given, as a real send would: missing values are listed,
 * not refused. Reads only: no settings row is created, nothing is sent.
 */
export async function renderTemplate(
  tenantId: string,
  slug: string,
  options: RenderTemplateOptions = {},
): Promise<RenderedTemplate> {
  const template = await GetModel(TemplateModel, tenantId).getBySlug(slug);
  if (!template)
    throw new SendError("template_not_found", `Unknown template "${slug}"`);
  const snapshot = await snapshotToRender(
    tenantId,
    template,
    options.version ?? "published",
  );
  const settings = await readSettings(tenantId);
  const locale = pickLocale(
    snapshot.content,
    options.locale,
    settings.fallbackLocale,
  );
  const localeContent = localeContentOf(snapshot.content, locale);
  if (!localeContent)
    throw new SendError(
      "invalid_content",
      `Template "${slug}" has no content for "${locale}"`,
    );
  const email = resolveEmail(
    localeContent,
    options.variables ?? {},
    "send",
    valueFormatOf(locale, snapshot.variables),
  );
  return {
    subject: email.subject,
    preheader: email.preheader,
    html: await renderEmailHtml(email, locale),
    text: renderPlainText(email, locale),
    locale,
    version: snapshot.version,
    missing: email.missing,
  };
}
