import type { JsonSchema } from "@antelopejs/interface-dms-automation";
import { SEND_EVENT_TYPES, type SendEventType } from "../types";
import {
  channelTrigger,
  TriggerChannel,
  type TriggerSettings,
} from "./emitter";

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
};

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

/** Hands a provider event on a send to every subscription that takes it. */
export function emitEmailEvent(payload: EmailEventPayload): void {
  emailEventChannel.emit(payload);
}

const STRING: JsonSchema = { type: "string" };

export const emailEventTrigger = channelTrigger(emailEventChannel, {
  name: "E-mail event",
  description:
    "Fires when a provider reports a delivery event on a mailing send; test sends only when enabled",
  icon: "i-ph-bell-ringing",
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
