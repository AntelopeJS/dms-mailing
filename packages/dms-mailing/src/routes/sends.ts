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
import { ZodError, type z } from "zod";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type { SendTemplateResult } from "@antelopejs/interface-dms-mailing";
import type {
  BannerContent,
  StatGroupItem,
} from "@antelopejs/interface-dms/base";
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
  normalizeAddress,
  SendEventModel,
  SendModel,
  TemplateModel,
} from "../db";
import { resolveEmail, valueFormatOf } from "../engine";
import type { InterpolationMode } from "../engine/tokens";
import { SendsPageController } from "../pages/sends";
import { localeOfRequest } from "../services/localized-text";
import { readCapabilities } from "../services/provider";
import { buildProviderBanner } from "../services/provider-banner";
import { renderEmailHtml } from "../services/render";
import {
  type CheckedSendParams,
  sendUnlessSuppressed,
} from "../services/checked-send";
import { MANUAL_SEND_SOURCE, subjectFor } from "../services/send";
import { SendError } from "../services/send-error";
import {
  buildSendStats,
  isTransportFailure,
  type SendWindow,
  MAX_BULK_REPLAY,
  type SendStats,
  trackingOf,
} from "../services/send-stats";
import { buildSendStatItems } from "../services/send-stat-items";
import type { DateRange } from "../services/metrics";
import { assertSendPermission } from "../services/permissions";
import { getSettings } from "../services/settings";
import { findSuppression, suppressedSendIds } from "../services/suppressions";
import {
  contentOfVersion,
  localeContentOf,
  pickLocale,
  publishedVersionOf,
  requireTemplate,
  snapshotOfVersion,
} from "../services/templates";
import {
  isResolvedStage,
  type SuppressionSummary,
  type TemplateStatus,
} from "../types";
import type { JsonObject } from "../types/json";
import { parseJsonObject } from "../validation/json";
import {
  type previewVersionSchema,
  realSendSchema,
  replayFailedSchema,
  replaySchema,
  testSendSchema,
} from "../validation/templates.schema";
import { comparisonRange, currentRange, isComparisonWanted } from "./period";
import {
  ALREADY_REPLAYED,
  CLAIMED_ELSEWHERE,
  type ClaimedReplay,
  isProblemSend,
  isSuppressedResult,
  needsNewAddress,
  NOT_STARTED,
  type ReplayFailedResponse,
  replayReport,
  type ReplayResponse,
  replayResponse,
} from "./replay";

export type { ReplayFailedResponse, ReplayResponse } from "./replay";

const NOT_FOUND = "$dms_mailing.errors.send_not_found";
const INVALID_CONTENT = "$dms_mailing.errors.invalid_content";
const INVALID_RECIPIENT = "$dms_mailing.errors.invalid_recipient";
const RECIPIENT_FIELD = "to";
const NEEDS_NEW_ADDRESS = "$dms_mailing.errors.replay_needs_new_address";
const NO_REPLAY_AFTER_SPAM = "$dms_mailing.errors.no_replay_after_spam";
const NO_REPLAY_WITH_ATTACHMENTS =
  "$dms_mailing.errors.no_replay_with_attachments";
const TEST_SEND_SOURCE = "dms-mailing:test-send";
const REPLAY_SOURCE = "dms-mailing:replay";
const FIX_ADDRESS_SOURCE = "dms-mailing:fix-address";
const HOUR_MS = 3_600_000;
const DRAFT_VERSION = 0;
/** Renders as the recipient got it, not as the editor previews it. */
const SEND_MODE: InterpolationMode = "send";

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
  /** The recipient's entry on the suppression list, `null` when it has none. */
  suppression: SuppressionSummary | null;
}

/**
 * What a test send did. A test to the editor's own address goes out even when
 * the address is suppressed; `ownAddressSuppressed` says so.
 */
export interface TestSendResponse {
  results: SendTemplateResult[];
  ownAddressSuppressed?: SuppressionSummary;
}

export interface SendStatsResponse extends SendStats {
  items: StatGroupItem[];
}

export interface SendHtmlResponse {
  html: string;
  subject: string;
  locale: string;
  version: number;
  /**
   * A draft test is rendered from today's draft, which may differ from what
   * was sent.
   */
  approximate: boolean;
  /** The sender of the settings today, not necessarily the one it went with. */
  from: string;
  fromName: string;
}

const sameAddress = (left: string, right: string): boolean =>
  normalizeAddress(left) === normalizeAddress(right);

/** A bad address gets its own message; any other invalid field is the content's. */
function sendInputError(error: ZodError): string {
  const isRecipient = error.issues.some(
    (issue) => issue.path[0] === RECIPIENT_FIELD,
  );
  return isRecipient ? INVALID_RECIPIENT : INVALID_CONTENT;
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
  ): Promise<TestSendResponse> {
    await assertSendPermission(this.user, this.tenantId);
    const input = assertValidation(
      body,
      (value) => testSendSchema.parse(value),
      (error) =>
        error instanceof ZodError ? sendInputError(error) : INVALID_CONTENT,
    );
    const template = await requireTemplate(this.templates, id);
    const ownAddressSuppressed = await this.ownSuppression(input.to);
    const result = await this.send(
      {
        tenantId: this.tenantId,
        to: input.to,
        allowSuppressed: [this.user.email],
        locale: input.locale,
        variables: input.data,
        content: input.content,
        version: requestedVersionOf(input.version),
        isTest: true,
        source: TEST_SEND_SOURCE,
      },
      template.slug,
    );
    return {
      results: result.results ?? [result],
      ...(ownAddressSuppressed && { ownAddressSuppressed }),
    };
  }

  /** The editor's own entry on the suppression list, when a test goes to it. */
  private async ownSuppression(
    to: string[],
  ): Promise<SuppressionSummary | undefined> {
    const isOwn = (address: string) => sameAddress(address, this.user.email);
    if (!to.some(isOwn)) return undefined;
    return (await findSuppression(this.tenantId, this.user.email)) ?? undefined;
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
      (error) =>
        error instanceof ZodError ? sendInputError(error) : INVALID_CONTENT,
    );
    const template = await requireTemplate(this.templates, id);
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
    const [current, previous, capabilities] = await Promise.all([
      this.sendWindow(range),
      isComparisonWanted(this.ctx)
        ? this.sendWindow(comparisonRange(this.ctx, range))
        : null,
      readCapabilities(),
    ]);
    const stats = buildSendStats(current, previous, trackingOf(capabilities));
    return {
      ...stats,
      items: buildSendStatItems(stats, capabilities?.name ?? ""),
    };
  }

  /**
   * The provider banner of the send log: what is wrong with the provider and
   * the failures of the last hour a send again may fix, or nothing.
   */
  @Get("/sends/banner")
  async banner(): Promise<BannerContent | null> {
    const since = new Date(Date.now() - HOUR_MS);
    const [capabilities, failures, recentSends] = await Promise.all([
      readCapabilities(),
      this.sends.listProviderFailures(since, new Date()),
      this.sends.countReal(since),
    ]);
    const suppressed = await suppressedSendIds(this.tenantId, failures);
    return buildProviderBanner({
      providerName: capabilities?.name ?? "",
      providerReachable: capabilities !== null,
      recentFailures: failures.length,
      transportFailures: failures.filter(isTransportFailure).length,
      suppressedFailures: suppressed.size,
      recentSends,
      since,
    });
  }

  @Get("/sends/:id")
  async detail(
    @Parameter("id", "param") id: string,
  ): Promise<SendDetailResponse> {
    const send = await this.requireSend(id);
    const events = await this.events.getBySend(id);
    events.sort((left, right) => left.at.getTime() - right.at.getTime());
    const [template, suppression] = await Promise.all([
      this.templates.get(send.templateId),
      findSuppression(this.tenantId, send.recipientEmail),
    ]);
    return {
      send,
      events,
      template: template
        ? summarize(template.localize(localeOfRequest(this.ctx), ["name"]))
        : null,
      suppression,
    };
  }

  /**
   * What the recipient received: the version the send used, rendered with the
   * variables it carried.
   */
  @Get("/sends/:id/html")
  async html(@Parameter("id", "param") id: string): Promise<SendHtmlResponse> {
    const send = await this.requireSend(id);
    const template = await requireTemplate(this.templates, send.templateId);
    const { content, variables } = await snapshotOfVersion(
      this.tenantId,
      template,
      send.templateVersion,
    );
    const settings = await getSettings(this.tenantId);
    const locale = pickLocale(content, send.locale, settings.fallbackLocale);
    const localeContent = localeContentOf(content, locale);
    assert(localeContent, HTTP_UNPROCESSABLE, INVALID_CONTENT);
    const email = resolveEmail(
      localeContent,
      variablesOf(send),
      SEND_MODE,
      valueFormatOf(locale, variables),
    );
    const version = send.templateVersion;
    return {
      html: await renderEmailHtml(email, locale),
      subject: subjectFor(email.subject, send.isTest),
      locale,
      version,
      approximate: version === DRAFT_VERSION,
      from: settings.senderEmail,
      fromName: settings.senderName,
    };
  }

  /**
   * Sends the same version and data again, and marks the original as dealt
   * with. A permanent bounce only takes another address; a spam report is
   * never answered with another e-mail. A problem is claimed before it goes,
   * so a second request, at once or later, answers 409 and sends nothing.
   */
  @Post("/sends/:id/replay")
  async replay(
    @Parameter("id", "param") id: string,
    @JSONBody() body: unknown,
  ): Promise<ReplayResponse> {
    await assertSendPermission(this.user, this.tenantId);
    const { to } = assertValidation(body ?? {}, (value) =>
      replaySchema.parse(value),
    );
    const send = await this.requireSend(id);
    assert(send.status !== "spam", HTTP_CONFLICT, NO_REPLAY_AFTER_SPAM);
    assert(!isResolvedStage(send.stage), HTTP_CONFLICT, ALREADY_REPLAYED);
    const isFix = needsNewAddress(send);
    const isNewAddress = !!to && !sameAddress(to, send.recipientEmail);
    assert(!isFix || isNewAddress, HTTP_CONFLICT, NEEDS_NEW_ADDRESS);
    const source = isFix ? FIX_ADDRESS_SOURCE : REPLAY_SOURCE;
    if (isProblemSend(send)) {
      const claimed = await this.sends.claimResolution(send._id, this.user._id);
      assert(claimed, HTTP_CONFLICT, ALREADY_REPLAYED);
      return this.repeatClaimed(send, to, source);
    }
    const result = await this.repeat(send, to, source);
    await this.recordReplay(send._id, result);
    return replayResponse(result);
  }

  /** Sends a claimed problem again; the claim is given back when nothing left. */
  private async repeatClaimed(
    send: MailingSend,
    to: string | undefined,
    source: string,
  ): Promise<ReplayResponse> {
    try {
      const result = await this.repeat(send, to, source);
      await this.recordReplay(send._id, result);
      if (isSuppressedResult(result))
        await this.sends.releaseResolution(send._id);
      return replayResponse(result);
    } catch (error) {
      await this.sends.releaseResolution(send._id);
      throw error;
    }
  }

  /**
   * Sends again every provider failure since `since` (default: the last
   * hour), the first {@link MAX_BULK_REPLAY}. Each one is claimed before it
   * goes, so running it twice never sends a failure twice. A failure whose
   * address is on the suppression list is left out: it stays a problem.
   */
  @Post("/sends/replay-failed")
  async replayFailed(@JSONBody() body: unknown): Promise<ReplayFailedResponse> {
    await assertSendPermission(this.user, this.tenantId);
    const { since } = assertValidation(body ?? {}, (value) =>
      replayFailedSchema.parse(value),
    );
    const from = since ?? new Date(Date.now() - HOUR_MS);
    const failures = await this.sends.listProviderFailures(from, new Date());
    const suppressed = await suppressedSendIds(this.tenantId, failures);
    const sendable = failures
      .filter((failure) => !suppressed.has(failure._id))
      .slice(0, MAX_BULK_REPLAY);
    const results: SendTemplateResult[] = [];
    let failed = 0;
    for (const failure of sendable) {
      const outcome = await this.replayClaimed(failure._id);
      if (outcome === CLAIMED_ELSEWHERE) continue;
      if (outcome === NOT_STARTED) failed++;
      else results.push(outcome);
    }
    return replayReport(results, failed, suppressed.size);
  }

  /** Sends one failure again unless someone already did. */
  private async replayClaimed(sendId: string): Promise<ClaimedReplay> {
    if (!(await this.sends.claimResolution(sendId, this.user._id)))
      return CLAIMED_ELSEWHERE;
    try {
      const send = await this.requireSend(sendId);
      return await this.repeatClaimed(send, undefined, REPLAY_SOURCE);
    } catch {
      await this.sends.releaseResolution(sendId);
      return NOT_STARTED;
    }
  }

  /**
   * Links the original and the send that repeated it, both ways. A send again
   * the suppression list stopped only points back: nothing left, so the
   * original stays a problem.
   */
  private async recordReplay(
    originalId: string,
    result: SendTemplateResult,
  ): Promise<void> {
    if (!result.sendId) return;
    if (isSuppressedResult(result)) {
      await this.sends.linkReplayOf(result.sendId, originalId);
      return;
    }
    await this.sends.markReplayed(originalId, {
      replayedBy: result.sendId,
      resolvedBy: this.user._id,
    });
    await this.sends.linkReplayOf(result.sendId, originalId);
  }

  private async repeat(
    send: MailingSend,
    to: string | undefined,
    source: string,
  ): Promise<SendTemplateResult> {
    assert(!send.json_attachments, HTTP_CONFLICT, NO_REPLAY_WITH_ATTACHMENTS);
    const template = await requireTemplate(this.templates, send.templateId);
    const version = send.templateVersion;
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

  /** The window's sends tallied, and the latencies of its real ones. */
  private async sendWindow(range: DateRange): Promise<SendWindow> {
    const scope = { from: range.from, to: range.to };
    const [tallies, latencies] = await Promise.all([
      this.sends.tally({ ...scope, isTestLeftOut: false }, { by: "none" }),
      this.sends.listLatencies({ ...scope, isTestLeftOut: true }),
    ]);
    return { tallies, latencies };
  }

  private async send(
    params: CheckedSendParams,
    slug: string,
  ): Promise<SendTemplateResult> {
    try {
      return await sendUnlessSuppressed(slug, params);
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

/**
 * The version a test of a published version records: a number names one,
 * "draft" or "published" let the send decide.
 */
function requestedVersionOf(
  version: z.infer<typeof previewVersionSchema> | undefined,
): number | undefined {
  return version === "draft" || version === "published" ? undefined : version;
}

function variablesOf(send: MailingSend): JsonObject {
  return parseJsonObject(send.json_variables || "{}");
}

function summarize(template: MailingTemplate): SendTemplateSummary {
  return {
    id: template._id,
    name: template.name,
    status: template.status,
    publishedVersion: publishedVersionOf(template),
  };
}
