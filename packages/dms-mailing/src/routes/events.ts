import {
  Context,
  Controller,
  JSONBody,
  Parameter,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { z } from "zod";
import { API_BASE_PATH, HTTP_FORBIDDEN } from "../constants";
import { recordEmailEvent, webhookSecretMatches } from "../services/events";
import { getSettings } from "../services/settings";
import { SEND_STATUSES, type SendStatus } from "../types";

const SECRET_HEADER = "x-mailing-webhook-secret";
const BAD_SECRET = "$dms_mailing.errors.bad_webhook_secret";

const eventSchema = z.object({
  messageId: z.string().min(1),
  type: z.enum(SEND_STATUSES as [SendStatus, ...SendStatus[]]),
  at: z.coerce.date().optional(),
  details: z.record(z.unknown()).optional(),
  tenantId: z.string().optional(),
});

export class MailingEventsController extends Controller(
  `${API_BASE_PATH}/events`,
) {
  @Context()
  declare ctx: RequestContext;

  @Post("/:provider")
  async receive(
    @Parameter("provider", "param") provider: string,
    @Parameter(SECRET_HEADER, "header") secret: string | undefined,
    @JSONBody() body: unknown,
  ) {
    const event = assertValidation(body, (value) => eventSchema.parse(value));
    const tenantId = event.tenantId ?? getRequestTenantId(this.ctx);
    const settings = await getSettings(tenantId);
    assert(
      webhookSecretMatches(secret, settings.webhookSecret),
      HTTP_FORBIDDEN,
      BAD_SECRET,
    );
    const recorded = await recordEmailEvent(tenantId, {
      provider,
      messageId: event.messageId,
      type: event.type,
      at: event.at,
      details: event.details,
    });
    return { recorded };
  }
}
