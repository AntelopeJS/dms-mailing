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
import { collectContentVariablePaths, resolveEmail } from "../engine";
import { type MailingTemplate, TemplateModel } from "../db";
import { TemplatesPageController } from "../pages/templates";
import { renderEmailHtml } from "../services/render";
import { getSettings } from "../services/settings";
import {
  contentFieldsOf,
  displayName,
  localeContentOf,
  parseContent,
  parseTestData,
  parseVariables,
  pickLocale,
  saveContent,
} from "../services/templates";
import type {
  MailingSettingsValues,
  TemplateContent,
  TemplateStatus,
  VariableDefinition,
} from "../types";
import {
  duplicateSchema,
  previewSchema,
  templateContentSchema,
  testDataSchema,
  variablesSchema,
} from "../validation/templates.schema";

const NOT_FOUND = "$dms_mailing.errors.template_not_found";
const DUPLICATE_SLUG = "$dms_mailing.errors.duplicate_slug";
const INVALID_CONTENT = "$dms_mailing.errors.invalid_content";

const STATUS_TRANSITIONS: Record<string, TemplateStatus> = {
  publish: "live",
  unpublish: "draft",
  archive: "archived",
};

export interface CategoriesResponse {
  categories: MailingSettingsValues["categories"];
}

export interface TemplateContentResponse {
  template: MailingTemplate;
  content: TemplateContent;
  variables: VariableDefinition[];
  /** Paths the content actually references, across every locale. */
  detectedVariables: string[];
  testData: Record<string, unknown>;
  fallbackLocale: string;
  categories: MailingSettingsValues["categories"];
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

  private get tenantId(): string {
    return getRequestTenantId(this.ctx);
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

  @Get("/:id/content")
  async content(
    @Parameter("id", "param") id: string,
  ): Promise<TemplateContentResponse> {
    const template = await this.requireTemplate(id);
    const settings = await getSettings(this.tenantId);
    const content = parseContent(template);
    return {
      template,
      content,
      variables: parseVariables(template),
      detectedVariables: collectContentVariablePaths(content),
      testData: parseTestData(template),
      fallbackLocale: settings.fallbackLocale,
      categories: settings.categories,
    };
  }

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
    await this.requireTemplate(id);
    await saveContent(this.tenantId, id, content, displayName(this.user));
    return {
      saved: true,
      detectedVariables: collectContentVariablePaths(content),
    };
  }

  @Post("/:id/publish")
  publish(@Parameter("id", "param") id: string) {
    return this.transition(id, "publish");
  }

  @Post("/:id/unpublish")
  unpublish(@Parameter("id", "param") id: string) {
    return this.transition(id, "unpublish");
  }

  @Post("/:id/archive")
  archive(@Parameter("id", "param") id: string) {
    return this.transition(id, "archive");
  }

  private async transition(id: string, action: string) {
    const template = await this.requireTemplate(id);
    const status = STATUS_TRANSITIONS[action] as TemplateStatus;
    const publishedAt = status === "live" ? new Date() : template.publishedAt;
    await this.templates.update(id, {
      status,
      publishedAt,
      updatedBy: displayName(this.user),
    });
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
      updatedBy: displayName(this.user),
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
      (input.content as TemplateContent | undefined) ?? parseContent(template);
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
    const author = displayName(this.user);
    const [copyId] = await this.templates.insert({
      slug,
      name,
      category: source.category,
      status: "draft",
      ...contentFieldsOf(source),
      updatedBy: author,
    });
    return { id: copyId };
  }
}
