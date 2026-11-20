import type { JsonSchema } from "@antelopejs/interface-dms-automation";
import { MAX_SLUG_LENGTH } from "../constants";
import type { TemplateStatus } from "../types";
import {
  channelTrigger,
  TriggerChannel,
  type TriggerSettings,
} from "./emitter";

type TemplatePublishOrigin = "editor" | "declaration";

export type TemplatePublishedPayload = {
  tenantId: string;
  templateId: string;
  slug: string;
  version: number;
  previousVersion: number;
  isNewVersion: boolean;
  previousStatus: TemplateStatus | "";
  changeCount: number;
  locales: string[];
  publishedBy: string;
  origin: TemplatePublishOrigin;
  publishedAt: string;
  deliveryId: string;
};

export interface TemplateTriggerConfig extends TriggerSettings {
  slugs?: string[];
}

export interface TemplatePublishedConfig extends TemplateTriggerConfig {
  includeDeclared?: boolean;
}

const TEMPLATE_PUBLISHED_TRIGGER_ID = "mailing.template-published";

export const TEMPLATE_STATUSES: TemplateStatus[] = [
  "draft",
  "live",
  "archived",
];

/** Whether a subscription's slug filter takes a template; empty takes all. */
export const acceptsSlug = (
  config: Partial<TemplateTriggerConfig>,
  payload: { slug: string },
): boolean => !config.slugs?.length || config.slugs.includes(payload.slug);

const accepts = (
  config: Partial<TemplatePublishedConfig>,
  payload: TemplatePublishedPayload,
): boolean =>
  (payload.origin !== "declaration" || config.includeDeclared === true) &&
  acceptsSlug(config, payload);

export const templatePublishedChannel = new TriggerChannel<
  TemplatePublishedConfig,
  TemplatePublishedPayload
>(TEMPLATE_PUBLISHED_TRIGGER_ID, accepts);

export const SLUGS_CONFIG_PROPERTY: JsonSchema = {
  type: "array",
  items: {
    type: "string",
    maxLength: MAX_SLUG_LENGTH,
    pattern: "^[a-z0-9][a-z0-9-]*$",
  },
  description:
    "Templates the trigger fires for. Leave empty to fire for every template.",
};

const STRING: JsonSchema = { type: "string" };
const NUMBER: JsonSchema = { type: "number" };

export const templatePublishedTrigger = channelTrigger(
  templatePublishedChannel,
  {
    name: "Template published",
    description:
      "Fires when a mailing template's draft is published and becomes what sends deliver",
    icon: "i-ph-paper-plane-tilt",
    configProperties: {
      slugs: SLUGS_CONFIG_PROPERTY,
      includeDeclared: {
        type: "boolean",
        default: false,
        description:
          "Also fire for templates a project declares at workspace setup",
      },
    },
    outputProperties: {
      tenantId: { ...STRING, description: "Workspace of the template" },
      templateId: { ...STRING, description: "Template id" },
      slug: {
        ...STRING,
        description: 'Template slug, the input of "Send e-mail template"',
      },
      version: {
        ...NUMBER,
        minimum: 1,
        description: "Published version after the publish",
      },
      previousVersion: {
        ...NUMBER,
        minimum: 0,
        description: "Version before; 0 for a first publish",
      },
      isNewVersion: {
        type: "boolean",
        description: "False for a publish that changed nothing",
      },
      previousStatus: {
        type: "string",
        enum: [...TEMPLATE_STATUSES, ""],
        description: "Status before the publish; empty for a declaration",
      },
      changeCount: {
        ...NUMBER,
        minimum: 0,
        description: "Changes the publish shipped",
      },
      locales: {
        type: "array",
        items: STRING,
        description: "Locales the published content carries",
      },
      publishedBy: {
        ...STRING,
        description: "Author's display name, or the declaration's author",
      },
      origin: {
        type: "string",
        enum: ["editor", "declaration"],
        description: "Where the publish came from",
      },
      publishedAt: { ...STRING, description: "Time of the publish" },
      deliveryId: {
        ...STRING,
        description: "Same value for a repeated delivery of one publish",
      },
    },
  },
);
