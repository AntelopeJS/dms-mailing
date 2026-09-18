import {
  Context,
  Controller,
  Get,
  HTTPResult,
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
  HTTP_NOT_FOUND,
  HTTP_UNPROCESSABLE,
} from "../constants";
import {
  type MailingSend,
  type MailingSendEvent,
  SendEventModel,
  SendModel,
  TemplateModel,
} from "../db";
import { resolveEmail } from "../engine";
import type {
  SendTemplateParams,
  SendTemplateResult,
} from "@antelopejs/interface-dms-mailing";
import { SendsPageController } from "../pages/sends";
import { renderEmailHtml } from "../services/render";
import { SendError, sendTemplate } from "../services/send";
import { assertSendPermission } from "../services/permissions";
import { getSettings } from "../services/settings";
import {
  localeContentOf,
  parseContent,
  pickLocale,
} from "../services/templates";
import type { TemplateContent } from "../types";
import { realSendSchema, testSendSchema } from "../validation/templates.schema";

const NOT_FOUND = "$dms_mailing.errors.send_not_found";
const TEMPLATE_NOT_FOUND = "$dms_mailing.errors.template_not_found";
const TEMPLATE_GONE = "$dms_mailing.errors.template_not_found";
const INVALID_CONTENT = "$dms_mailing.errors.invalid_content";
const TEST_SEND_SOURCE = "dms-mailing:test-send";
const REPLAY_SOURCE = "dms-mailing:replay";
const MANUAL_SEND_SOURCE = "dms-mailing:manual";

interface TestSendInput {
  locale: string;
  content?: TemplateContent;
  data?: Record<string, unknown>;
}

export interface SendDetailResponse {
  send: MailingSend;
  events: MailingSendEvent[];
}

export class SendsController extends Controller(API_BASE_PATH) {
  @Context()
  declare ctx: RequestContext;

  @AuthUserWithPermission(SendsPageController)
  declare user: User;

  @TenantScopedModel(SendModel)
  declare sends: SendModel;

  @TenantScopedModel(SendEventModel)
  declare events: SendEventModel;

  @TenantScopedModel(TemplateModel)
  declare templates: TemplateModel;

  private get tenantId(): string {
    return getRequestTenantId(this.ctx);
  }

  private async requireSend(id: string): Promise<MailingSend> {
    const send = await this.sends.get(id);
    assert(send, HTTP_NOT_FOUND, NOT_FOUND);
    return send;
  }

  @Post("/templates/:id/test-send")
  async testSend(
    @Parameter("id", "param") id: string,
    @JSONBody() body: unknown,
  ) {
    await assertSendPermission(this.user, this.tenantId);
    const input = assertValidation(
      body,
      (value) => testSendSchema.parse(value),
      () => INVALID_CONTENT,
    );
    const template = await this.templates.get(id);
    assert(template, HTTP_NOT_FOUND, TEMPLATE_NOT_FOUND);
    const result = await this.send(
      {
        tenantId: this.tenantId,
        to: input.to,
        locale: (input as TestSendInput).locale,
        variables: (input as TestSendInput).data,
        content: (input as TestSendInput).content,
        isTest: true,
        source: TEST_SEND_SOURCE,
      },
      template.slug,
    );
    return { results: result.results ?? [result] };
  }

  /**
   * A genuine send: it reaches real recipients and counts in the business
   * figures. `prepareSend` refuses anything but a live template.
   */
  @Post("/templates/:id/send")
  async realSend(
    @Parameter("id", "param") id: string,
    @JSONBody() body: unknown,
  ) {
    await assertSendPermission(this.user, this.tenantId);
    const input = assertValidation(
      body,
      (value) => realSendSchema.parse(value),
      () => INVALID_CONTENT,
    );
    const template = await this.templates.get(id);
    assert(template, HTTP_NOT_FOUND, TEMPLATE_NOT_FOUND);
    const result = await this.send(
      {
        tenantId: this.tenantId,
        to: input.to,
        locale: input.locale,
        variables: input.data,
        isTest: false,
        source: MANUAL_SEND_SOURCE,
      },
      template.slug,
    );
    return { results: result.results ?? [result] };
  }

  @Get("/sends/:id")
  async detail(
    @Parameter("id", "param") id: string,
  ): Promise<SendDetailResponse> {
    const send = await this.requireSend(id);
    const events = await this.events.getBySend(id);
    events.sort((left, right) => left.at.getTime() - right.at.getTime());
    return { send, events };
  }

  @Get("/sends/:id/html")
  async html(@Parameter("id", "param") id: string) {
    const send = await this.requireSend(id);
    // There is no version history: this re-renders the template as it stands
    // today, which may differ from what actually went out.
    const template = await this.templates.get(send.templateId);
    assert(template, HTTP_NOT_FOUND, TEMPLATE_GONE);
    const content = parseContent(template);
    const settings = await getSettings(this.tenantId);
    const locale = pickLocale(content, send.locale, settings.fallbackLocale);
    const localeContent = localeContentOf(content, locale);
    assert(localeContent, HTTP_UNPROCESSABLE, INVALID_CONTENT);
    const email = resolveEmail(
      localeContent,
      JSON.parse(send.json_variables || "{}") as Record<string, unknown>,
    );
    return { html: await renderEmailHtml(email, locale) };
  }

  @Post("/sends/:id/replay")
  async replay(@Parameter("id", "param") id: string) {
    await assertSendPermission(this.user, this.tenantId);
    const send = await this.requireSend(id);
    return this.send(
      {
        tenantId: this.tenantId,
        to: send.recipientEmail,
        locale: send.locale,
        variables: JSON.parse(send.json_variables || "{}") as Record<
          string,
          unknown
        >,
        isTest: send.isTest,
        source: REPLAY_SOURCE,
      },
      send.templateSlug,
    );
  }

  private async send(
    params: SendTemplateParams,
    slug: string,
  ): Promise<SendTemplateResult> {
    try {
      return await sendTemplate(slug, params);
    } catch (error) {
      if (error instanceof SendError) {
        throw new HTTPResult(
          HTTP_UNPROCESSABLE,
          `$dms_mailing.errors.${error.code}`,
        );
      }
      throw error;
    }
  }
}
