import type {
  ActionType,
  JsonSchema,
} from "@antelopejs/interface-dms-automation";
import { z } from "zod";
import { MAX_SLUG_LENGTH } from "../constants";
import { templateSummaryOf } from "../services/template-summary";
import type { TemplateAttentionReason, VariableDefinition } from "../types";
import { isoOrAbsent, parseInput, TENANT_INPUT } from "./action-input";
import { resolveTenant } from "./tenant";
import { TEMPLATE_STATUSES } from "./template-published-trigger";

export type GetTemplateInput = {
  tenantId?: string;
  slug: string;
  locale?: string;
};

type VariableOutput = { path: string; type: string; required: boolean };

export type GetTemplateOutput = {
  found: boolean;
  slug: string;
  templateId?: string;
  name?: string;
  category?: string;
  status?: string;
  publishedVersion?: number;
  publishedAt?: string;
  hasDraft?: boolean;
  locales?: string[];
  variables?: VariableOutput[];
  requiredVariables?: string[];
  attention?: TemplateAttentionReason[];
};

const GET_TEMPLATE_ACTION_ID = "mailing.get-template";

/** The longest locale code a template input takes (BCP 47). */
export const MAX_LOCALE_LENGTH = 35;

const VARIABLE_TYPES = [
  "string",
  "text",
  "number",
  "money",
  "date",
  "url",
  "boolean",
  "array",
];

/** A template slug as an action input takes it. */
export const slugInputSchema = z.string().trim().min(1).max(MAX_SLUG_LENGTH);

/** A locale as an action input takes it; empty lets the fallback pick. */
export const localeInputSchema = z
  .string()
  .trim()
  .max(MAX_LOCALE_LENGTH)
  .optional()
  .transform((locale) => locale || undefined);

const getTemplateInputSchema = z.object({
  slug: slugInputSchema,
  locale: localeInputSchema,
});

const STRING: JsonSchema = { type: "string" };

const variableOutput = (variable: VariableDefinition): VariableOutput => ({
  path: variable.path,
  type: variable.type,
  required: variable.required,
});

export const getTemplateAction: ActionType<
  GetTemplateInput,
  GetTemplateOutput
> = {
  id: GET_TEMPLATE_ACTION_ID,
  name: "Get template",
  description:
    "Read a mailing template's status, version, locales and variables, e.g. to check it before sending",
  icon: "i-ph-envelope-simple",
  sideEffects: false,
  inputSchema: {
    type: "object",
    properties: {
      tenantId: TENANT_INPUT,
      slug: {
        ...STRING,
        maxLength: MAX_SLUG_LENGTH,
        pattern: "^[a-z0-9][a-z0-9-]*$",
        description: "Slug of the template",
      },
      locale: {
        ...STRING,
        maxLength: MAX_LOCALE_LENGTH,
        description:
          "Language of the returned name; empty uses the workspace fallback locale",
      },
    },
    required: ["slug"],
  },
  outputSchema: {
    type: "object",
    properties: {
      found: { type: "boolean", description: "A template has this slug" },
      slug: { ...STRING, description: "Echo of the input" },
      templateId: STRING,
      name: STRING,
      category: { ...STRING, description: "Category id" },
      status: {
        ...STRING,
        enum: TEMPLATE_STATUSES,
        description: '"live" means "Send e-mail template" can send it',
      },
      publishedVersion: {
        type: "number",
        minimum: 0,
        description: "Version sends deliver; 0 before the first publish",
      },
      publishedAt: { ...STRING, description: "Last publish" },
      hasDraft: {
        type: "boolean",
        description: "Unpublished changes are waiting",
      },
      locales: {
        type: "array",
        items: STRING,
        description: "Locales of the published content",
      },
      variables: {
        type: "array",
        description: "Published variable contract",
        items: {
          type: "object",
          properties: {
            path: STRING,
            type: { ...STRING, enum: VARIABLE_TYPES },
            required: { type: "boolean" },
          },
        },
      },
      requiredVariables: {
        type: "array",
        items: STRING,
        description: "Paths of the required variables",
      },
      attention: {
        type: "array",
        items: {
          ...STRING,
          enum: ["stale_draft", "never_sent", "missing_locale"],
        },
        description: "Why the template needs a look",
      },
    },
  },
  async execute(input) {
    const { slug, locale } = parseInput(
      GET_TEMPLATE_ACTION_ID,
      getTemplateInputSchema,
      input,
    );
    const tenantId = await resolveTenant(
      GET_TEMPLATE_ACTION_ID,
      input.tenantId,
    );
    const summary = await templateSummaryOf(tenantId, slug, locale);
    if (!summary) return { found: false, slug };
    return {
      found: true,
      slug,
      templateId: summary.templateId,
      name: summary.name,
      category: summary.category,
      status: summary.status,
      publishedVersion: summary.publishedVersion,
      publishedAt: isoOrAbsent(summary.publishedAt),
      hasDraft: summary.hasDraft,
      locales: summary.locales,
      variables: summary.variables.map(variableOutput),
      requiredVariables: summary.variables
        .filter((variable) => variable.required)
        .map((variable) => variable.path),
      attention: summary.attention,
    };
  },
};
