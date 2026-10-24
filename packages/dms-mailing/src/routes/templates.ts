import {
  Context,
  Controller,
  Get,
  JSONBody,
  Parameter,
  Post,
  Put,
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
  valueFormatOf,
} from "../engine";
import {
  type MailingTemplate,
  SendModel,
  type TemplateFields,
  TemplateModel,
} from "../db";
import { saveDetails } from "../data/templates-table";
import { TemplatesPageController } from "../pages/templates";
import { forAudience, statsWindowStart } from "../services/metrics";
import { refreshTemplateAttention } from "../services/template-attention";
import { renderEmailHtml } from "../services/render";
import { categoriesIn } from "../services/categories";
import { localeOfRequest, withTextIn } from "../services/localized-text";
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
  discardDraft,
  displayName,
  hasDraft,
  isPublished,
  isStaleRevision,
  localeContentOf,
  localesWithoutSubject,
  parseContent,
  parseTestData,
  parseVariables,
  pendingChanges,
  pickLocale,
  publishedVersionOf,
  publishTemplate,
  saveDraft,
  publishedSnapshot,
  snapshotOfVersion,
  type TemplateDraft,
  workingSnapshot,
  workingContent,
  workingVariables,
  refuseTakenSlug,
  requireTemplate,
} from "../services/templates";
import {
  BUSINESS_AUDIENCE,
  type CategoryInLocale,
  type TemplateContent,
  type TemplateStatus,
  type VariableDefinition,
} from "../types";
import {
  duplicateSchema,
  previewSchema,
  publishSchema,
  saveContentSchema,
  testDataSchema,
  variablesSchema,
} from "../validation/templates.schema";

const STARTER_NOT_FOUND = "$dms_mailing.errors.starter_not_found";
const INVALID_CONTENT = "$dms_mailing.errors.invalid_content";
const INVALID_TRANSITION = "$dms_mailing.errors.invalid_transition";
const NOTHING_TO_PUBLISH = "$dms_mailing.errors.nothing_to_publish";
const NOTHING_TO_DISCARD = "$dms_mailing.errors.nothing_to_discard";
const DRAFT_CONFLICT = "$dms_mailing.errors.draft_conflict";
const EMPTY_SUBJECT = "$dms_mailing.errors.empty_subject";

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

/** What a lifecycle action records besides the new status. */
const TRANSITION_FIELDS: Partial<Record<TemplateAction, () => TemplateFields>> =
  {
    unpublish: () => ({ unpublishedAt: new Date() }),
  };

export interface CategoriesResponse {
  categories: CategoryInLocale[];
}

export interface TemplateSender {
  name: string;
  email: string;
  replyTo: string;
}

export interface TemplateContentResponse {
  /** The template, its name in the reader's language. */
  template: MailingTemplate;
  /** The content the editor works on: the draft, else the published one. */
  content: TemplateContent;
  /** What customers receive; `null` when the template was never published. */
  publishedContent: TemplateContent | null;
  hasDraft: boolean;
  /** Version customers receive; 0 when never published. */
  version: number;
  /** The draft revision a save or a publish must carry back. */
  revision: number;
  changes: TemplateChange[];
  /** The declarations the editor works on: the draft's, else the published. */
  variables: VariableDefinition[];
  /** Paths the working content references, across every locale. */
  detectedVariables: string[];
  /**
   * The contract callers send against: the published declarations and the
   * paths the published content references; `null` when never published.
   */
  publishedVariables: VariableDefinition[] | null;
  publishedDetectedVariables: string[] | null;
  testData: Record<string, unknown>;
  fallbackLocale: string;
  /** Whether a send missing a variable fails rather than goes out blank. */
  blockOnMissingVariables: boolean;
  categories: CategoryInLocale[];
  sender: TemplateSender;
}

export interface StarterSummary {
  id: string;
  name: string;
  slug: string;
  category: string;
  locales: string[];
}

/**
 * Refuses a write of the draft from a writer behind it: it would silently
 * drop what another editor saved meanwhile.
 */
export function assertCurrentDraft(
  template: MailingTemplate,
  revision: number | undefined,
): void {
  assert(!isStaleRevision(template, revision), HTTP_CONFLICT, DRAFT_CONFLICT);
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

  @TenantScopedModel(SendModel)
  declare sends: SendModel;

  private get tenantId(): string {
    return getRequestTenantId(this.ctx);
  }

  private get author(): string {
    return displayName(this.user);
  }

  /** The language the reader reads names and labels in. */
  private get locale(): string {
    return localeOfRequest(this.ctx);
  }

  /**
   * The tenant's categories for a category picker. Separate from `/settings`,
   * which is guarded by the settings page permission a template editor need
   * not hold.
   */
  @Get("/categories")
  async categories(): Promise<CategoriesResponse> {
    const settings = await getSettings(this.tenantId);
    return { categories: categoriesIn(settings.categories, this.locale) };
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

  /**
   * A starter's thumbnail, in the `locale` asked for (the interface's) when
   * the starter has it, else the tenant fallback; its test amounts are
   * written the way that locale writes them.
   */
  @Get("/starters/:id/preview")
  async starterPreview(
    @Parameter("id", "param") id: string,
    @Parameter("locale", "query") requested?: string,
  ) {
    const starter = findStarter(id);
    assert(starter, HTTP_NOT_FOUND, STARTER_NOT_FOUND);
    const settings = await getSettings(this.tenantId);
    const locale = pickLocale(
      starter.content,
      requested || undefined,
      settings.fallbackLocale,
    );
    const localeContent = localeContentOf(starter.content, locale);
    assert(localeContent, HTTP_UNPROCESSABLE, INVALID_CONTENT);
    const email = resolveEmail(
      localeContent,
      starter.testDataFor(locale),
      undefined,
      valueFormatOf(locale, starter.variables),
    );
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
    const template = await requireTemplate(this.templates, id);
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
    const template = await requireTemplate(this.templates, id);
    const settings = await getSettings(this.tenantId);
    const content = workingContent(template);
    const publishedContent = isPublished(template)
      ? parseContent(template)
      : null;
    return {
      template: template.localize(this.locale, ["name"]),
      content,
      publishedContent,
      hasDraft: hasDraft(template),
      version: publishedVersionOf(template),
      revision: template.draftRevision,
      changes: pendingChanges(template),
      variables: workingVariables(template),
      detectedVariables: collectContentVariablePaths(content),
      publishedVariables: publishedContent ? parseVariables(template) : null,
      publishedDetectedVariables: publishedContent
        ? collectContentVariablePaths(publishedContent)
        : null,
      testData: parseTestData(template),
      fallbackLocale: settings.fallbackLocale,
      blockOnMissingVariables: settings.blockOnMissingVariables,
      categories: categoriesIn(settings.categories, this.locale),
      sender: {
        name: settings.senderName,
        email: settings.senderEmail,
        replyTo: settings.replyTo,
      },
    };
  }

  /**
   * Saves the editor's content, and its variable declarations when given, as
   * the draft; customers and callers keep the published ones. A save carrying
   * an older revision than the stored draft is refused: it would silently
   * drop what another editor saved meanwhile.
   */
  @Post("/:id/content")
  async replaceContent(
    @Parameter("id", "param") id: string,
    @JSONBody() body: unknown,
  ) {
    const input = assertValidation(
      body,
      (value) => saveContentSchema.parse(value),
      () => INVALID_CONTENT,
    );
    const content = input.content as TemplateContent;
    const template = await requireTemplate(this.templates, id);
    assertCurrentDraft(template, input.revision);
    const variables = input.variables ?? workingVariables(template);
    const revision = await saveDraft(
      this.tenantId,
      template,
      { content, variables },
      this.author,
    );
    const saved = await requireTemplate(this.templates, id);
    return {
      saved: true,
      revision,
      detectedVariables: collectContentVariablePaths(content),
      changes: pendingChanges(saved),
    };
  }

  @Get("/:id/changes")
  async changes(@Parameter("id", "param") id: string) {
    const template = await requireTemplate(this.templates, id);
    return {
      version: publishedVersionOf(template),
      revision: template.draftRevision,
      changes: pendingChanges(template),
    };
  }

  /**
   * Ships the working content. A publish carrying a revision ships only the
   * draft its review showed: one saved elsewhere since is refused.
   */
  @Post("/:id/publish")
  async publish(
    @Parameter("id", "param") id: string,
    @JSONBody() body: unknown,
  ) {
    const { revision } = assertValidation(body ?? {}, (value) =>
      publishSchema.parse(value),
    );
    const template = await this.requireTransition(id, "publish");
    assertCurrentDraft(template, revision);
    const content = workingContent(template);
    assert(
      Object.keys(content.locales).length > 0,
      HTTP_UNPROCESSABLE,
      NOTHING_TO_PUBLISH,
    );
    assert(
      localesWithoutSubject(content).length === 0,
      HTTP_UNPROCESSABLE,
      EMPTY_SUBJECT,
    );
    const outcome = await publishTemplate(this.tenantId, template, this.author);
    return { status: "live", ...outcome };
  }

  /** Drops the draft back to the published content; nothing before v1. */
  @Post("/:id/discard")
  async discard(@Parameter("id", "param") id: string) {
    const template = await requireTemplate(this.templates, id);
    assert(isPublished(template), HTTP_CONFLICT, NOTHING_TO_DISCARD);
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
    const template = await requireTemplate(this.templates, id);
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
    await this.templates.updateFields(id, {
      status,
      updatedBy: this.author,
      ...TRANSITION_FIELDS[action]?.(),
    });
    await refreshTemplateAttention(this.tenantId);
    return { status };
  }

  /**
   * Writes the variable declarations into the draft, next to its content:
   * callers keep the published contract until a publish ships them.
   */
  @Post("/:id/variables")
  async variables(
    @Parameter("id", "param") id: string,
    @JSONBody() body: unknown,
  ) {
    const { variables, revision } = assertValidation(body, (value) =>
      variablesSchema.parse(value),
    );
    const template = await requireTemplate(this.templates, id);
    assertCurrentDraft(template, revision);
    const next = await saveDraft(
      this.tenantId,
      template,
      { content: workingContent(template), variables },
      this.author,
    );
    return { variables, revision: next };
  }

  @Post("/:id/test-data")
  async testData(
    @Parameter("id", "param") id: string,
    @JSONBody() body: unknown,
  ) {
    const { data } = assertValidation(body, (value) =>
      testDataSchema.parse(value),
    );
    await requireTemplate(this.templates, id);
    await this.templates.updateFields(id, {
      json_test_data: JSON.stringify(data),
    });
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
    const template = await requireTemplate(this.templates, id);
    const { content, variables } = input.content
      ? {
          ...workingSnapshot(template),
          content: input.content as TemplateContent,
        }
      : await this.previewSnapshot(template, input.version);
    const settings = await getSettings(this.tenantId);
    const locale = pickLocale(content, input.locale, settings.fallbackLocale);
    const localeContent = localeContentOf(content, locale);
    assert(localeContent, HTTP_UNPROCESSABLE, INVALID_CONTENT);
    const email = resolveEmail(
      localeContent,
      input.data ?? parseTestData(template),
      undefined,
      valueFormatOf(locale, variables),
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

  private previewSnapshot(
    template: MailingTemplate,
    version: "draft" | "published" | number | undefined,
  ): Promise<TemplateDraft> | TemplateDraft {
    if (version === "published") return publishedSnapshot(template);
    if (typeof version === "number")
      return snapshotOfVersion(this.tenantId, template, version);
    return workingSnapshot(template);
  }

  /**
   * Renames a template in the reader's language, its other languages kept,
   * and sets its category: what the module's drawer and editor save, each
   * showing one language. The DMS edit form, which shows every language,
   * writes through the table's edit route.
   */
  @Put("/:id/details")
  async details(
    @Parameter("id", "param") id: string,
    @JSONBody() body: unknown,
  ) {
    const template = await requireTemplate(this.templates, id);
    await saveDetails(this.ctx, template, body, this.author);
    return { id };
  }

  @Post("/:id/duplicate")
  async duplicate(
    @Parameter("id", "param") id: string,
    @JSONBody() body: unknown,
  ) {
    const { slug, name } = assertValidation(body, (value) =>
      duplicateSchema.parse(value),
    );
    const source = await requireTemplate(this.templates, id);
    const [copyId] = await refuseTakenSlug(
      this.templates.insertFields({
        slug,
        name: withTextIn(undefined, this.locale, name),
        category: source.category,
        status: "draft",
        ...contentFieldsOf(source),
        updatedBy: this.author,
      }),
    );
    await refreshTemplateAttention(this.tenantId);
    return { id: copyId };
  }
}
