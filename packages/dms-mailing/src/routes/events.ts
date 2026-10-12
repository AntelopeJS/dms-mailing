import {
  Context,
  Controller,
  HTTPResult,
  Parameter,
  Post,
  RawBody,
  type RequestContext,
} from "@antelopejs/interface-api";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { z } from "zod";
import { API_BASE_PATH, HTTP_BAD_REQUEST, HTTP_FORBIDDEN } from "../constants";
import { recordEmailEvent } from "../services/events";
import { findSettings } from "../services/settings";
import {
  isWebhookTestEvent,
  noteWebhookReceived,
  noteWebhookRefused,
  refusalBody,
  secretRefusal,
  WEBHOOK_SECRET_HEADER,
} from "../services/webhook-status";
import {
  SEND_EVENT_TYPES,
  type SendEventType,
  type WebhookRefusal,
} from "../types";

const eventSchema = z.object({
  messageId: z.string().min(1),
  type: z.enum(SEND_EVENT_TYPES as [SendEventType, ...SendEventType[]]),
  at: z.coerce.date().optional(),
  details: z.record(z.unknown()).optional(),
  tenantId: z.string().optional(),
});

type ParsedEvent = z.infer<typeof eventSchema>;

const STATUS_OF_REFUSAL: Record<WebhookRefusal, number> = {
  missing_secret: HTTP_FORBIDDEN,
  bad_secret: HTTP_FORBIDDEN,
  invalid_event: HTTP_BAD_REQUEST,
};

interface ReceivedEvent {
  provider: string;
  secret: string | undefined;
  body: unknown;
  /** The tenant the URL names; it wins over one the body carries. */
  tenantId?: string;
}

/** What the webhook answers an accepted call. */
export interface WebhookResponse {
  recorded: boolean;
  /** Set on the settings' test event: received, and recorded nowhere. */
  test?: true;
}

/**
 * The body as JSON, `undefined` when it is not: a malformed body is refused
 * as an invalid event, after the secret, never answered with a parser error.
 */
function parseBody(raw: Buffer): unknown {
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    return undefined;
  }
}

/** The tenant id a body names, when it is a well-formed event. */
function tenantIdOf(parsed: z.SafeParseReturnType<unknown, ParsedEvent>) {
  return parsed.success ? parsed.data.tenantId : undefined;
}

export class MailingEventsController extends Controller(
  `${API_BASE_PATH}/events`,
) {
  @Context()
  declare ctx: RequestContext;

  @Post("/:provider")
  async receive(
    @Parameter("provider", "param") provider: string,
    @Parameter(WEBHOOK_SECRET_HEADER, "header") secret: string | undefined,
    @RawBody() body: Buffer,
  ): Promise<WebhookResponse> {
    return this.record({ provider, secret, body: parseBody(body) });
  }

  /** The address the settings show: the tenant is part of the URL. */
  @Post("/:provider/:tenantId")
  async receiveForTenant(
    @Parameter("provider", "param") provider: string,
    @Parameter("tenantId", "param") tenantId: string,
    @Parameter(WEBHOOK_SECRET_HEADER, "header") secret: string | undefined,
    @RawBody() body: Buffer,
  ): Promise<WebhookResponse> {
    return this.record({ provider, secret, body: parseBody(body), tenantId });
  }

  /**
   * Checks the secret before the body, so a caller without it learns nothing
   * of the format. Every refusal of a known tenant is remembered for the
   * settings, with its reason.
   */
  private async record(received: ReceivedEvent): Promise<WebhookResponse> {
    const parsed = eventSchema.safeParse(received.body);
    const tenantId =
      received.tenantId ?? tenantIdOf(parsed) ?? getRequestTenantId(this.ctx);
    const settings = await findSettings(tenantId);
    const refusal = settings
      ? secretRefusal(received.secret, settings.webhookSecret)
      : "bad_secret";
    if (refusal) return this.refuse(tenantId, received, refusal, !!settings);
    if (!parsed.success)
      return this.refuse(tenantId, received, "invalid_event", true);
    return this.accept(tenantId, received.provider, parsed.data);
  }

  private async refuse(
    tenantId: string,
    received: ReceivedEvent,
    reason: WebhookRefusal,
    isKnownTenant: boolean,
  ): Promise<never> {
    if (isKnownTenant)
      await noteWebhookRefused(tenantId, received.provider, reason);
    throw new HTTPResult(STATUS_OF_REFUSAL[reason], refusalBody(reason));
  }

  private async accept(
    tenantId: string,
    provider: string,
    event: ParsedEvent,
  ): Promise<WebhookResponse> {
    const isTest = isWebhookTestEvent(event.messageId);
    const recorded =
      !isTest &&
      (await recordEmailEvent(tenantId, {
        provider,
        messageId: event.messageId,
        type: event.type,
        at: event.at,
        details: event.details,
      }));
    await noteWebhookReceived(tenantId, {
      provider,
      type: event.type,
      isMatched: recorded,
      isTest,
    });
    return isTest ? { recorded, test: true } : { recorded };
  }
}
