import type { JsonSchema } from "@antelopejs/interface-dms-automation";
import { SEND_EVENT_TYPES, type SendEventType } from "../types";
import {
  channelTrigger,
  TriggerChannel,
  type TriggerSettings,
} from "./emitter";
import type { AutomationOriginFields } from "./origin";
import { AUTOMATION_ACTOR_PREFIX } from "./tenant";

export type EmailEventPayload = {
  tenantId: string;
  sendId: string;
  templateSlug: string;
  type: SendEventType;
  recipientEmail: string;
  isTest: boolean;
  deliveryId: string;
  at: string;
  source?: string;
} & AutomationOriginFields;

export interface EmailEventTriggerConfig extends TriggerSettings {
  types?: SendEventType[];
  includeTests?: boolean;
}

export const EMAIL_EVENT_TRIGGER_ID = "mailing.email-event";

const accepts = (
  config: Partial<EmailEventTriggerConfig>,
  payload: EmailEventPayload,
): boolean =>
  (!payload.isTest || config.includeTests === true) &&
  (!config.types?.length || config.types.includes(payload.type));

const emailEventChannel = new TriggerChannel<
  EmailEventTriggerConfig,
  EmailEventPayload
>(EMAIL_EVENT_TRIGGER_ID, accepts);

/**
 * The procedure a send's `source` names: a procedure's send is recorded as
 * `automation:<procedure id>`. The send keeps no run, so no run id is known.
 */
function sendOrigin(source: string | undefined): AutomationOriginFields {
  if (!source?.startsWith(AUTOMATION_ACTOR_PREFIX)) return {};
  const procedureId = source.slice(AUTOMATION_ACTOR_PREFIX.length);
  return procedureId ? { originProcedureId: procedureId } : {};
}

/**
 * Hands a provider event on a send to every subscription that takes it. An
 * event on a procedure's send counts as caused by that procedure: it fires
 * only where procedure-made changes are taken, and passes the circuit
 * breaker on the workspace, the procedure and the recipient, so a procedure
 * that sends again on each event of its own sends stops, whatever new send
 * each round makes.
 */
export function emitEmailEvent(payload: EmailEventPayload): void {
  const origin = sendOrigin(payload.source);
  const recipient = payload.recipientEmail.trim().toLowerCase();
  emailEventChannel.emitAttributed(
    `${payload.tenantId}|${origin.originProcedureId ?? ""}|${recipient}`,
    { ...payload, ...origin },
  );
}

const STRING: JsonSchema = { type: "string" };

export const emailEventTrigger = channelTrigger(emailEventChannel, {
  name: "E-mail event",
  description:
    "Fires when a provider reports a delivery event on a mailing send; test sends only when enabled",
  icon: "i-ph-bell-ringing",
  automationWrites: true,
  configProperties: {
    types: {
      type: "array",
      items: { type: "string", enum: SEND_EVENT_TYPES },
      description:
        "Event types the trigger fires on. Leave empty to fire on every event.",
    },
    includeTests: {
      type: "boolean",
      default: false,
      description: "Also fire for events on test sends",
    },
  },
  outputProperties: {
    tenantId: { ...STRING, description: "Workspace of the send" },
    sendId: {
      ...STRING,
      description: 'Send log id; input of "Get send"',
    },
    templateSlug: { ...STRING, description: "Template of the send" },
    type: { type: "string", enum: SEND_EVENT_TYPES, description: "Event type" },
    recipientEmail: { ...STRING, description: "Recipient address" },
    isTest: { type: "boolean", description: "The send is a test send" },
    deliveryId: {
      ...STRING,
      description: "Same value for a repeated delivery of one provider event",
    },
    at: { ...STRING, description: "When the event happened" },
    source: {
      ...STRING,
      description:
        "What made the send, e.g. automation:<procedure id> for a procedure's send",
    },
  },
});
