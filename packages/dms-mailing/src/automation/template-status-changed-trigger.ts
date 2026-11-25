import type { JsonSchema } from "@antelopejs/interface-dms-automation";
import type { TemplateStatus } from "../types";
import { channelTrigger, TriggerChannel } from "./emitter";
import {
  acceptsSlug,
  SLUGS_CONFIG_PROPERTY,
  TEMPLATE_STATUSES,
  type TemplateTriggerConfig,
} from "./template-published-trigger";

/** What moves a template from one status to another. */
export type TemplateAction = "publish" | "unpublish" | "archive" | "restore";

const TEMPLATE_ACTIONS: TemplateAction[] = [
  "publish",
  "unpublish",
  "archive",
  "restore",
];

export type TemplateStatusChangedPayload = {
  tenantId: string;
  templateId: string;
  slug: string;
  previousStatus: TemplateStatus;
  status: TemplateStatus;
  action: TemplateAction;
  publishedVersion: number;
  changedBy: string;
  changedAt: string;
  deliveryId: string;
};

export interface TemplateStatusChangedConfig extends TemplateTriggerConfig {
  statuses?: TemplateStatus[];
}

const TEMPLATE_STATUS_CHANGED_TRIGGER_ID = "mailing.template-status-changed";

const accepts = (
  config: Partial<TemplateStatusChangedConfig>,
  payload: TemplateStatusChangedPayload,
): boolean =>
  (!config.statuses?.length || config.statuses.includes(payload.status)) &&
  acceptsSlug(config, payload);

export const templateStatusChangedChannel = new TriggerChannel<
  TemplateStatusChangedConfig,
  TemplateStatusChangedPayload
>(TEMPLATE_STATUS_CHANGED_TRIGGER_ID, accepts);

const STRING: JsonSchema = { type: "string" };
const STATUS: JsonSchema = { type: "string", enum: TEMPLATE_STATUSES };

export const templateStatusChangedTrigger = channelTrigger(
  templateStatusChangedChannel,
  {
    name: "Template status changed",
    description:
      "Fires when a mailing template goes live, back to draft, to the archive or out of it",
    icon: "i-ph-arrows-left-right",
    configProperties: {
      slugs: SLUGS_CONFIG_PROPERTY,
      statuses: {
        type: "array",
        items: STATUS,
        description:
          "New statuses the trigger fires on. Leave empty to fire on every change.",
      },
    },
    outputProperties: {
      tenantId: { ...STRING, description: "Workspace of the template" },
      templateId: { ...STRING, description: "Template id" },
      slug: { ...STRING, description: "Template slug" },
      previousStatus: { ...STATUS, description: "Status before" },
      status: { ...STATUS, description: "Status after" },
      action: {
        type: "string",
        enum: TEMPLATE_ACTIONS,
        description: "What changed it",
      },
      publishedVersion: {
        type: "number",
        minimum: 0,
        description:
          "Version sends deliver after the change; 0 before any publish",
      },
      changedBy: { ...STRING, description: "Author's display name" },
      changedAt: { ...STRING, description: "Time of the change" },
      deliveryId: {
        ...STRING,
        description: "Same value for a repeated delivery of one change",
      },
    },
  },
);
