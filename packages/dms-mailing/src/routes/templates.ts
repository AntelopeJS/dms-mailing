import {
  Context,
  Controller,
  Get,
  JSONBody,
  Parameter,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  API_BASE_PATH,
  HTTP_CONFLICT,
  HTTP_NOT_FOUND,
  HTTP_UNPROCESSABLE,
} from "../constants";
import {
  collectContentVariablePaths,
  resolveEmail,
  type TemplateChange,
} from "../engine";
import {
  type MailingTemplate,
  SendModel,
  TemplateModel,
  TemplateVersionModel,
} from "../db";
import { TemplatesPageController } from "../pages/templates";
import { forAudience } from "../services/metrics";
import { renderEmailHtml } from "../services/render";
import { getSettings } from "../services/settings";
import { findStarter, STARTER_TEMPLATES } from "../services/starters";
import {
  performanceOf,
  statsOf,
  type TemplatePerformance,
  type TemplateStats,
} from "../services/template-stats";
import {
  contentFieldsOf,
  contentOfVersion,
  discardDraft,
  displayName,
  hasDraft,
  isPublished,
  localeContentOf,
  parseContent,
  parseTestData,
  parseVariables,
  pendingChanges,
  pickLocale,
  publishedVersionOf,
  publishTemplate,
  saveDraft,
  workingContent,
} from "../services/templates";
import {
  BUSINESS_AUDIENCE,
  type MailingSettingsValues,
  type TemplateContent,
  type TemplateStatus,
  type VariableDefinition,
} from "../types";
import {
  duplicateSchema,
  previewSchema,
  templateContentSchema,
  testDataSchema,
  variablesSchema,
} from "../validation/templates.schema";

const NOT_FOUND = "$dms_mailing.errors.template_not_found";
const STARTER_NOT_FOUND = "$dms_mailing.errors.starter_not_found";
const DUPLICATE_SLUG = "$dms_mailing.errors.duplicate_slug";
const INVALID_CONTENT = "$dms_mailing.errors.invalid_content";
const INVALID_TRANSITION = "$dms_mailing.errors.invalid_transition";
const NOTHING_TO_PUBLISH = "$dms_mailing.errors.nothing_to_publish";
const STATS_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

type TemplateAction = "publish" | "unpublish" | "archive" | "restore";

/** The statuses each lifecycle action may start from. */
const ALLOWED_FROM: Record<TemplateAction, TemplateStatus[]> = {
  publish: ["draft", "live"],
  unpublish: ["live"],
  archive: ["draft", "live"],
  restore: ["archived"],
};

const TARGET_STATUS: Record<
  Exclude<TemplateAction, "publish">,
  TemplateStatus
> = {
  unpublish: "draft",
  archive: "archived",
  restore: "draft",
};

export interface CategoriesResponse {
  categories: MailingSettingsValues["categories"];
}

export interface TemplateSender {
  name: string;
  email: string;
  replyTo: string;
}

export interface TemplateContentResponse {
  template: MailingTemplate;
  /** The content the editor works on: the draft, else the published one. */
  content: TemplateContent;
  /** What customers receive; `null` when the template was never published. */
  publishedContent: TemplateContent | null;
  hasDraft: boolean;
  /** Version customers receive; 0 when never published. */
  version: number;
  changes: TemplateChange[];
  variables: VariableDefinition[];
  /** Paths the content actually references, across every locale. */
  detectedVariables: string[];
  testData: Record<string, unknown>;
  fallbackLocale: string;
  categories: MailingSettingsValues["categories"];
  sender: TemplateSender;
}

export interface TemplateVersionSummary {
  version: number;
  publishedAt: Date;
  publishedBy: string;
  locales: string;
  changes: TemplateChange[];
}

export interface StarterSummary {
  id: string;
  name: string;
  slug: string;
  category: string;
  locales: string[];
}

function statsWindowStart(now: number = Date.now()): Date {
  return new Date(now - STATS_WINDOW_DAYS * DAY_MS);
}

export class TemplatesController extends Controller(
  `${API_BASE_PATH}/templates`,
) {
  @Context()
  declare ctx: RequestContext;

  @AuthUserWithPermission(TemplatesPageController)
  declare user: User;

  @TenantScopedModel(TemplateModel)
  declare templates: TemplateModel;

  @TenantScopedModel(TemplateVersionModel)
  declare versions: TemplateVersionModel;

  @TenantScopedModel(SendModel)
  declare sends: SendModel;

  private get tenantId(): string {
    return getRequestTenantId(this.ctx);
  }

  private get author(): string {
    return displayName(this.user);
  }

  private async requireTemplate(id: string): Promise<MailingTemplate> {
    const template = await this.templates.get(id);
    assert(template, HTTP_NOT_FOUND, NOT_FOUND);
    return template;
  }

  /**
   * The tenant's categories for a category picker. Separate from `/settings`,
   * which is guarded by the settings page permission a template editor need
   * not hold.
   */
  @Get("/categories")
  async categories(): Promise<CategoriesResponse> {
    const settings = await getSettings(this.tenantId);
    return { categories: settings.categories };
  }

  @Get("/starters")
  starters(): { starters: StarterSummary[] } {
    return {
      starters: STARTER_TEMPLATES.map((starter) => ({
        id: starter.id,
        name: starter.name,
        slug: starter.slug,
        category: starter.category,
        locales: Object.keys(starter.content.locales),
      })),
    };
  }

  @Get("/starters/:id/preview")
  async starterPreview(@Parameter("id", "param") id: string) {
    const starter = findStarter(id);
    assert(starter, HTTP_NOT_FOUND, STARTER_NOT_FOUND);
    const settings = await getSettings(this.tenantId);
    const locale = pickLocale(
      starter.content,
      undefined,
      settings.fallbackLocale,
    );
    const localeContent = localeContentOf(starter.content, locale);
    assert(localeContent, HTTP_UNPROCESSABLE, INVALID_CONTENT);
    const email = resolveEmail(localeContent, starter.testData);
    return { html: await renderEmailHtml(email, locale), locale };
  }

  /**
   * Last 30 days of real sends per template, for the gallery cards and the
   * "Needs attention" tab. Test sends are left out like in the Overview.
   */
  @Get("/overview")
  async overview(): Promise<{ items: TemplateStats[] }> {
    const [templates, rows] = await Promise.all([
      this.templates.getAll(),
      this.sends.listBetween(statsWindowStart(), new Date()),
    ]);
    const sends = forAudience(rows, BUSINESS_AUDIENCE);
    return {
      items: templates.map((template) =>
        statsOf(
          template._id,
          template.slug,
          sends.filter((send) => send.templateSlug === template.slug),
        ),
      ),
    };
  }

  @Get("/:id/performance")
  async performance(
    @Parameter("id", "param") id: string,
  ): Promise<TemplatePerformance> {
    const template = await this.requireTemplate(id);
    const rows = await this.sends.listForTemplate(
      template.slug,
      statsWindowStart(),
    );
    return performanceOf(
      template._id,
      template.slug,
      forAudience(rows, BUSINESS_AUDIENCE),
    );
  }

  @Get("/:id/content")
  async content(
    @Parameter("id", "param") id: string,
  ): Promise<TemplateContentResponse> {
    const template = await this.requireTemplate(id);
    const settings = await getSettings(this.tenantId);
    const content = workingContent(template);
    return {
      template,
      content,
      publishedContent: isPublished(template) ? parseContent(template) : null,
      hasDraft: hasDraft(template),
      version: publishedVersionOf(template),
      changes: pendingChanges(template),
      variables: parseVariables(template),
      detectedVariables: collectContentVariablePaths(content),
      testData: parseTestData(template),
      fallbackLocale: settings.fallbackLocale,
      categories: settings.categories,
      sender: {
        name: settings.senderName,
        email: settings.senderEmail,
        replyTo: settings.replyTo,
      },
    };
  }

  /** Saves the editor's content as the draft; customers keep the published one. */
  @Post("/:id/content")
  async replaceContent(
    @Parameter("id", "param") id: string,
    @JSONBody() body: unknown,
  ) {
    const content = assertValidation(
      body,
      (value) =>
        templateContentSchema.parse(
          (value as { content: unknown }).content,
        ) as TemplateContent,
      () => INVALID_CONTENT,
    );
    const template = await this.requireTemplate(id);
    await saveDraft(this.tenantId, template, content, this.author);
    const saved = await this.requireTemplate(id);
    return {
      saved: true,
      detectedVariables: collectContentVariablePaths(content),
      changes: pendingChanges(saved),
    };
  }

  @Get("/:id/changes")
  async changes(@Parameter("id", "param") id: string) {
    const template = await this.requireTemplate(id);
    return {
      version: publishedVersionOf(template),
      changes: pendingChanges(template),
    };
  }

  @Get("/:id/versions")
  async history(
    @Parameter("id", "param") id: string,
  ): Promise<{ versions: TemplateVersionSummary[] }> {
    await this.requireTemplate(id);
    const rows = await this.versions.listForTemplate(id);
    return {
      versions: rows.map((row) => ({
        version: row.version,
        publishedAt: row.publishedAt,
        publishedBy: row.publishedBy,
        locales: row.locales,
        changes: JSON.parse(row.json_changes || "[]") as TemplateChange[],
      })),
    };
  }

  @Post("/:id/publish")
  async publish(@Parameter("id", "param") id: string) {
    const template = await this.requireTransition(id, "publish");
    const content = workingContent(template);
    assert(
      Object.keys(content.locales).length > 0,
      HTTP_UNPROCESSABLE,
      NOTHING_TO_PUBLISH,
    );
    const outcome = await publishTemplate(this.tenantId, template, this.author);
    return { status: "live", ...outcome };
  }

  @Post("/:id/discard")
  async discard(@Parameter("id", "param") id: string) {
    const template = await this.requireTemplate(id);
    await discardDraft(this.tenantId, template, this.author);
    return { discarded: true };
  }

  @Post("/:id/unpublish")
  unpublish(@Parameter("id", "param") id: string) {
    return this.transition(id, "unpublish");
  }

  @Post("/:id/archive")
  archive(@Parameter("id", "param") id: string) {
    return this.transition(id, "archive");
  }

  @Post("/:id/restore")
  restore(@Parameter("id", "param") id: string) {
    return this.transition(id, "restore");
  }

  private async requireTransition(
    id: string,
    action: TemplateAction,
  ): Promise<MailingTemplate> {
    const template = await this.requireTemplate(id);
    assert(
      ALLOWED_FROM[action].includes(template.status),
      HTTP_CONFLICT,
      INVALID_TRANSITION,
    );
    return template;
  }

  private async transition(
    id: string,
    action: Exclude<TemplateAction, "publish">,
  ) {
    await this.requireTransition(id, action);
    const status = TARGET_STATUS[action];
    await this.templates.update(id, { status, updatedBy: this.author });
    return { status };
  }

  @Post("/:id/variables")
  async variables(
    @Parameter("id", "param") id: string,
    @JSONBody() body: unknown,
  ) {
    const { variables } = assertValidation(body, (value) =>
      variablesSchema.parse(value),
    );
    await this.requireTemplate(id);
    await this.templates.update(id, {
      json_variables: JSON.stringify(variables),
      updatedBy: this.author,
    });
    return { variables };
  }

  @Post("/:id/test-data")
  async testData(
    @Parameter("id", "param") id: string,
    @JSONBody() body: unknown,
  ) {
    const { data } = assertValidation(body, (value) =>
      testDataSchema.parse(value),
    );
    await this.requireTemplate(id);
    await this.templates.update(id, { json_test_data: JSON.stringify(data) });
    return { data };
  }

  @Post("/:id/preview")
  async preview(
    @Parameter("id", "param") id: string,
    @JSONBody() body: unknown,
  ) {
    const input = assertValidation(
      body,
      (value) => previewSchema.parse(value),
      () => INVALID_CONTENT,
    );
    const template = await this.requireTemplate(id);
    const content =
      (input.content as TemplateContent | undefined) ??
      (await this.previewContent(template, input.version));
    const settings = await getSettings(this.tenantId);
    const locale = pickLocale(content, input.locale, settings.fallbackLocale);
    const localeContent = localeContentOf(content, locale);
    assert(localeContent, HTTP_UNPROCESSABLE, INVALID_CONTENT);
    const email = resolveEmail(
      localeContent,
      input.data ?? parseTestData(template),
    );
    const html = await renderEmailHtml(email, locale);
    return {
      html,
      subject: email.subject,
      locale,
      missing: email.missing,
      hiddenBlockIds: email.hiddenBlockIds,
    };
  }

  private previewContent(
    template: MailingTemplate,
    version: "draft" | "published" | number | undefined,
  ): Promise<TemplateContent> | TemplateContent {
    if (version === "published") return parseContent(template);
    if (typeof version === "number")
      return contentOfVersion(this.tenantId, template, version);
    return workingContent(template);
  }

  @Post("/:id/duplicate")
  async duplicate(
    @Parameter("id", "param") id: string,
    @JSONBody() body: unknown,
  ) {
    const { slug, name } = assertValidation(body, (value) =>
      duplicateSchema.parse(value),
    );
    const source = await this.requireTemplate(id);
    const clash = await this.templates.getBySlug(slug);
    assert(!clash, HTTP_CONFLICT, DUPLICATE_SLUG);
    const [copyId] = await this.templates.insert({
      slug,
      name,
      category: source.category,
      status: "draft",
      ...contentFieldsOf(source),
      updatedBy: this.author,
    });
    return { id: copyId };
  }
}
