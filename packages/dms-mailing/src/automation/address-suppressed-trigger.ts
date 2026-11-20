import type { JsonSchema } from "@antelopejs/interface-dms-automation";
import { SUPPRESSION_REASONS, type SuppressionReason } from "../types";
import {
  channelTrigger,
  TriggerChannel,
  type TriggerSettings,
} from "./emitter";
import type { AutomationOriginFields } from "./origin";

export type AddressSuppressedPayload = {
  tenantId: string;
  suppressionId: string;
  email: string;
  reason: SuppressionReason;
  sendId: string;
  detail?: string;
  createdBy: string;
  createdAt: string;
  deliveryId: string;
} & AutomationOriginFields;

export interface SuppressionTriggerConfig extends TriggerSettings {
  reasons?: SuppressionReason[];
}

const ADDRESS_SUPPRESSED_TRIGGER_ID = "mailing.address-suppressed";

/** Whether a subscription's reason filter takes an entry's reason; empty takes all. */
export const acceptsReason = (
  config: Partial<SuppressionTriggerConfig>,
  payload: { reason: SuppressionReason },
): boolean =>
  !config.reasons?.length || config.reasons.includes(payload.reason);

export const addressSuppressedChannel = new TriggerChannel<
  SuppressionTriggerConfig,
  AddressSuppressedPayload
>(ADDRESS_SUPPRESSED_TRIGGER_ID, acceptsReason);

const STRING: JsonSchema = { type: "string" };

export const addressSuppressedTrigger = channelTrigger(
  addressSuppressedChannel,
  {
    name: "Address suppressed",
    description:
      "Fires when an address is put on a workspace's suppression list",
    icon: "i-ph-prohibit",
    automationWrites: true,
    configProperties: {
      reasons: {
        type: "array",
        items: { type: "string", enum: SUPPRESSION_REASONS },
        description:
          "Reasons the trigger fires on. Leave empty to fire on every reason.",
      },
    },
    outputProperties: {
      tenantId: { ...STRING, description: "Workspace of the list" },
      suppressionId: {
        ...STRING,
        description: "Entry id, derived from the address",
      },
      email: { ...STRING, description: "Address put on the list" },
      reason: {
        type: "string",
        enum: SUPPRESSION_REASONS,
        description: "Why",
      },
      sendId: {
        ...STRING,
        description:
          "Send whose event suppressed the address; empty when no send did",
      },
      detail: {
        ...STRING,
        description: "Provider's words or the note kept with the entry",
      },
      createdBy: {
        ...STRING,
        description:
          "Empty for a provider event, the user id for a manual entry, automation:<procedure id> for a procedure",
      },
      createdAt: { ...STRING, description: "When the entry was stored" },
      deliveryId: {
        ...STRING,
        description: "Same value for a repeated delivery of one event",
      },
    },
  },
);
