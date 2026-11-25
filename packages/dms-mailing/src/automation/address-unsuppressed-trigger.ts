import type { JsonSchema } from "@antelopejs/interface-dms-automation";
import { SUPPRESSION_REASONS, type SuppressionReason } from "../types";
import {
  acceptsReason,
  type SuppressionTriggerConfig,
} from "./address-suppressed-trigger";
import { channelTrigger, TriggerChannel } from "./emitter";
import type { AutomationOriginFields } from "./origin";

export type AddressUnsuppressedPayload = {
  tenantId: string;
  suppressionId: string;
  email: string;
  reason: SuppressionReason;
  sendId: string;
  suppressedAt: string;
  removedBy: string;
  removedAt: string;
  deliveryId: string;
} & AutomationOriginFields;

const ADDRESS_UNSUPPRESSED_TRIGGER_ID = "mailing.address-unsuppressed";

export const addressUnsuppressedChannel = new TriggerChannel<
  SuppressionTriggerConfig,
  AddressUnsuppressedPayload
>(ADDRESS_UNSUPPRESSED_TRIGGER_ID, acceptsReason);

const STRING: JsonSchema = { type: "string" };

export const addressUnsuppressedTrigger = channelTrigger(
  addressUnsuppressedChannel,
  {
    name: "Address lifted",
    description:
      "Fires when an address is taken off a workspace's suppression list",
    icon: "i-ph-envelope-open",
    automationWrites: true,
    configProperties: {
      reasons: {
        type: "array",
        items: { type: "string", enum: SUPPRESSION_REASONS },
        description:
          "Reasons of the lifted entry the trigger fires on. Leave empty to fire on every reason.",
      },
    },
    outputProperties: {
      tenantId: { ...STRING, description: "Workspace of the list" },
      suppressionId: { ...STRING, description: "Id of the removed entry" },
      email: { ...STRING, description: "Address lifted" },
      reason: {
        type: "string",
        enum: SUPPRESSION_REASONS,
        description: "Reason the entry had",
      },
      sendId: {
        ...STRING,
        description: "Send that had suppressed it; empty for a manual entry",
      },
      suppressedAt: {
        ...STRING,
        description: "When the removed entry was stored",
      },
      removedBy: {
        ...STRING,
        description:
          "User id for the dashboard, automation:<procedure id> for a procedure",
      },
      removedAt: { ...STRING, description: "Time of the removal" },
      deliveryId: {
        ...STRING,
        description: "Same value for a repeated delivery of one event",
      },
    },
  },
);
