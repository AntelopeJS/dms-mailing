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
import type { SendTemplateResult } from "@antelopejs/interface-dms-mailing";
import type { StatGroupItem } from "@antelopejs/interface-dms/base";
import {
  API_BASE_PATH,
  HTTP_CONFLICT,
  HTTP_NOT_FOUND,
  HTTP_UNPROCESSABLE,
} from "../constants";
import {
  type MailingSend,
  type MailingSendEvent,
  type MailingTemplate,
  SendEventModel,
  SendModel,
  TemplateModel,
} from "../db";
import { resolveEmail } from "../engine";
import { SendsPageController } from "../pages/sends";
import { readCapabilities } from "../services/provider";
import { renderEmailHtml } from "../services/render";
import {
  type ModuleSendParams,
  SendError,
  sendTemplate,
} from "../services/send";
import {
  buildSendStats,
  isProviderFailure,
  type SendStats,
} from "../services/send-stats";
import { buildSendStatItems } from "../services/send-stat-items";
import { assertSendPermission } from "../services/permissions";
import { getSettings } from "../services/settings";
import {
  contentOfVersion,
  localeContentOf,
  pickLocale,
  publishedVersionOf,
} from "../services/templates";
import type { SendStatus, TemplateContent, TemplateStatus } from "../types";
import {
  realSendSchema,
  replayFailedSchema,
  replaySchema,
  testSendSchema,
} from "../validation/templates.schema";
import { comparisonRange, currentRange } from "./period";

const NOT_FOUND = "$dms_mailing.errors.send_not_found";
const TEMPLATE_NOT_FOUND = "$dms_mailing.errors.template_not_found";
const INVALID_CONTENT = "$dms_mailing.errors.invalid_content";
const NEEDS_NEW_ADDRESS = "$dms_mailing.errors.replay_needs_new_address";
const NO_REPLAY_AFTER_SPAM = "$dms_mailing.errors.no_replay_after_spam";
const TEST_SEND_SOURCE = "dms-mailing:test-send";
const REPLAY_SOURCE = "dms-mailing:replay";
const FIX_ADDRESS_SOURCE = "dms-mailing:fix-address";
const MANUAL_SEND_SOURCE = "dms-mailing:manual";
const HOUR_MS = 3_600_000;
const MAX_BULK_REPLAY = 100;
const DRAFT_VERSION = 0;

interface TestSendInput {
  locale: string;
  content?: TemplateContent;
  data?: Record<string, unknown>;
}

export interface SendTemplateSummary {
  id: string;
  name: string;
  status: TemplateStatus;
  /** Version customers receive today, to compare with the send's. */
  publishedVersion: number;
}

export interface SendDetailResponse {
  send: MailingSend;
  events: MailingSendEvent[];
  /** `null` when the template was deleted since. */
  template: SendTemplateSummary | null;
}

export interface SendStatsResponse extends SendStats {
  items: StatGroupItem[];
}

export interface SendHealthResponse {
  providerName: string;
  providerReachable: boolean;
  /** Provider failures of the last hour, the ones a send again may fix. */
  recentFailures: number;
  since: string;
}

/** Problem statuses whose address is at fault: repeating the send cannot help. */
const ADDRESS_PROBLEMS: SendStatus[] = ["bounced"];

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

  /**
   * The stat strip of the send log, for the period the page selected: the
   * figures, and the `StatGroup` items that word them.
   */
  @Get("/sends/stats")
  async stats(): Promise<SendStatsResponse> {
    const range = currentRange(this.ctx);
    const previousRange = comparisonRange(this.ctx, range);
    const [current, previous, capabilities] = await Promise.all([
      this.sends.listBetween(range.from, range.to),
      this.sends.listBetween(previousRange.from, previousRange.to),
      readCapabilities(),
    ]);
    const stats = buildSendStats(current, previous);
    return {
      ...stats,
      items: buildSendStatItems(stats, capabilities?.name ?? ""),
    };
  }

  /** Whether the provider answers, and the failures a send again may fix. */
  @Get("/sends/health")
  async health(): Promise<SendHealthResponse> {
    const since = new Date(Date.now() - HOUR_MS);
    const [capabilities, recent] = await Promise.all([
      readCapabilities(),
      this.sends.listBetween(since, new Date()),
    ]);
    return {
      providerName: capabilities?.name ?? "",
      providerReachable: capabilities !== null,
      recentFailures: recent.filter(isProviderFailure).length,
      since: since.toISOString(),
    };
  }

  @Get("/sends/:id")
  async detail(
    @Parameter("id", "param") id: string,
  ): Promise<SendDetailResponse> {
    const send = await this.requireSend(id);
    const events = await this.events.getBySend(id);
    events.sort((left, right) => left.at.getTime() - right.at.getTime());
    const template = await this.templates.get(send.templateId);
    return { send, events, template: template ? summarize(template) : null };
  }

  /**
   * What the recipient received: the version the send used, rendered with the
   * variables it carried.
   */
  @Get("/sends/:id/html")
  async html(@Parameter("id", "param") id: string) {
    const send = await this.requireSend(id);
    const template = await this.templates.get(send.templateId);
    assert(template, HTTP_NOT_FOUND, TEMPLATE_NOT_FOUND);
    const content = await contentOfVersion(
      this.tenantId,
      template,
      send.templateVersion,
    );
    const settings = await getSettings(this.tenantId);
    const locale = pickLocale(content, send.locale, settings.fallbackLocale);
    const localeContent = localeContentOf(content, locale);
    assert(localeContent, HTTP_UNPROCESSABLE, INVALID_CONTENT);
    const email = resolveEmail(localeContent, variablesOf(send));
    return {
      html: await renderEmailHtml(email, locale),
      subject: email.subject,
      locale,
      version: send.templateVersion ?? DRAFT_VERSION,
      from: settings.senderEmail,
      fromName: settings.senderName,
    };
  }

  /**
   * Sends the same version and data again. A bounced address only takes a
   * corrected one; a spam report is never answered with another e-mail.
   */
  @Post("/sends/:id/replay")
  async replay(
    @Parameter("id", "param") id: string,
    @JSONBody() body: unknown,
  ) {
    await assertSendPermission(this.user, this.tenantId);
    const { to } = assertValidation(body ?? {}, (value) =>
      replaySchema.parse(value),
    );
    const send = await this.requireSend(id);
    assert(send.status !== "spam", HTTP_CONFLICT, NO_REPLAY_AFTER_SPAM);
    const needsNewAddress = ADDRESS_PROBLEMS.includes(send.status);
    const isNewAddress = !!to && to !== send.recipientEmail;
    assert(!needsNewAddress || isNewAddress, HTTP_CONFLICT, NEEDS_NEW_ADDRESS);
    return this.repeat(
      send,
      to,
      needsNewAddress ? FIX_ADDRESS_SOURCE : REPLAY_SOURCE,
    );
  }

  /** Sends again every provider failure since `since` (default: the last hour). */
  @Post("/sends/replay-failed")
  async replayFailed(@JSONBody() body: unknown) {
    await assertSendPermission(this.user, this.tenantId);
    const { since } = assertValidation(body ?? {}, (value) =>
      replayFailedSchema.parse(value),
    );
    const from = since ?? new Date(Date.now() - HOUR_MS);
    const rows = await this.sends.listBetween(from, new Date());
    const failures = rows.filter(isProviderFailure).slice(0, MAX_BULK_REPLAY);
    const results: SendTemplateResult[] = [];
    for (const failure of failures) {
      const send = await this.requireSend(failure._id);
      results.push(await this.repeat(send, undefined, REPLAY_SOURCE));
    }
    return { count: results.length, results };
  }

  private async repeat(
    send: MailingSend,
    to: string | undefined,
    source: string,
  ): Promise<SendTemplateResult> {
    const template = await this.templates.get(send.templateId);
    assert(template, HTTP_NOT_FOUND, TEMPLATE_NOT_FOUND);
    const version = send.templateVersion ?? DRAFT_VERSION;
    const content =
      version > DRAFT_VERSION
        ? await contentOfVersion(this.tenantId, template, version)
        : undefined;
    return this.send(
      {
        tenantId: this.tenantId,
        to: to ?? send.recipientEmail,
        locale: send.requestedLocale || send.locale,
        variables: variablesOf(send),
        content,
        version: content ? version : undefined,
        isTest: send.isTest,
        source,
      },
      send.templateSlug,
    );
  }

  private async send(
    params: ModuleSendParams,
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

function variablesOf(send: MailingSend): Record<string, unknown> {
  return JSON.parse(send.json_variables || "{}") as Record<string, unknown>;
}

function summarize(template: MailingTemplate): SendTemplateSummary {
  return {
    id: template._id,
    name: template.name,
    status: template.status,
    publishedVersion: publishedVersionOf(template),
  };
}
