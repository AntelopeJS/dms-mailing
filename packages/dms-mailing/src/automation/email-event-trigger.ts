import { Logging } from "@antelopejs/interface-core/logging";
import type {
  JsonSchema,
  TriggerType,
} from "@antelopejs/interface-dms-automation";
import { SEND_STATUSES, type SendEventType } from "../types";

export interface EmailEventPayload {
  tenantId: string;
  sendId: string;
  templateSlug: string;
  type: SendEventType;
  recipientEmail: string;
}

export interface EmailEventTriggerConfig {
  types?: SendEventType[];
}

interface EmailEventSubscription {
  types: SendEventType[];
  emit: (payload: EmailEventPayload) => void;
}

export const EMAIL_EVENT_TRIGGER_ID = "mailing.email-event";

const CONFIG_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    types: {
      type: "array",
      items: { type: "string", enum: SEND_STATUSES },
      description:
        "Event types the trigger fires on. Leave empty to fire on every event.",
    },
  },
};

const OUTPUT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    tenantId: { type: "string" },
    sendId: { type: "string" },
    templateSlug: { type: "string" },
    type: { type: "string", enum: SEND_STATUSES },
    recipientEmail: { type: "string" },
  },
};

const FIRST_SUBSCRIPTION_INDEX = 1;

const SUBSCRIPTION_FAILURE_PREFIX = "[dms-mailing] E-mail event subscription";

const subscriptions = new Map<string, EmailEventSubscription>();

let nextSubscriptionIndex = FIRST_SUBSCRIPTION_INDEX;

const accepts = (
  subscription: EmailEventSubscription,
  payload: EmailEventPayload,
): boolean =>
  subscription.types.length === 0 || subscription.types.includes(payload.type);

function deliver(
  handle: string,
  subscription: EmailEventSubscription,
  payload: EmailEventPayload,
): void {
  try {
    subscription.emit(payload);
  } catch (error) {
    Logging.Warn(
      `${SUBSCRIPTION_FAILURE_PREFIX} "${handle}" failed on a "${payload.type}" event:`,
      error,
    );
  }
}

export function emitEmailEvent(payload: EmailEventPayload): void {
  for (const [handle, subscription] of subscriptions) {
    if (accepts(subscription, payload)) deliver(handle, subscription, payload);
  }
}

/** Drops every active subscription so a reloaded module starts from nothing. */
export function clearEmailEventSubscriptions(): void {
  subscriptions.clear();
}

export const emailEventTrigger: TriggerType<
  EmailEventTriggerConfig,
  EmailEventPayload
> = {
  id: EMAIL_EVENT_TRIGGER_ID,
  name: "E-mail event",
  description:
    "Fires when a provider reports a delivery event on a mailing send",
  icon: "i-ph-bell-ringing",
  cluster: "replicated",
  configSchema: CONFIG_SCHEMA,
  outputSchema: OUTPUT_SCHEMA,
  activate(config, emit) {
    const handle = `${EMAIL_EVENT_TRIGGER_ID}:${nextSubscriptionIndex}`;
    nextSubscriptionIndex += 1;
    subscriptions.set(handle, { types: config?.types ?? [], emit });
    return Promise.resolve(handle);
  },
  deactivate(handle) {
    subscriptions.delete(String(handle));
    return Promise.resolve();
  },
};
