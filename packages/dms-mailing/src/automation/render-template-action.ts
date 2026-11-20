import type {
  ActionType,
  JsonObject,
  JsonSchema,
} from "@antelopejs/interface-dms-automation";
import { z } from "zod";
import { MAX_SLUG_LENGTH } from "../constants";
import { renderTemplate } from "../services/render-template";
import { jsonObjectSchema } from "../validation/json.schema";
import { parseInput, TENANT_INPUT } from "./action-input";
import {
  localeInputSchema,
  MAX_LOCALE_LENGTH,
  slugInputSchema,
} from "./get-template-action";
import { resolveTenant } from "./tenant";

export type RenderTemplateInput = {
  tenantId?: string;
  slug: string;
  locale?: string;
  variables?: JsonObject;
  version?: string;
  includeHtml?: boolean;
};

export type RenderTemplateOutput = {
  subject: string;
  preheader: string;
  html?: string;
  text: string;
  locale: string;
  version: number;
  missing: string[];
};

const RENDER_TEMPLATE_ACTION_ID = "mailing.render-template";

const VERSION_NUMBER = /^[1-9][0-9]*$/;

const versionSchema = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value || value === "published") return "published" as const;
    if (value === "draft") return "draft" as const;
    if (VERSION_NUMBER.test(value)) return Number(value);
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'expected "published", "draft" or a version number',
    });
    return z.NEVER;
  });

const renderInputSchema = z.object({
  slug: slugInputSchema,
  locale: localeInputSchema,
  variables: jsonObjectSchema.optional(),
  version: versionSchema,
  includeHtml: z.boolean().default(true),
});

const STRING: JsonSchema = { type: "string" };

export const renderTemplateAction: ActionType<
  RenderTemplateInput,
  RenderTemplateOutput
> = {
  id: RENDER_TEMPLATE_ACTION_ID,
  name: "Render template",
  description:
    "Render a mailing template with variables into its subject, HTML and plain text, without sending it",
  icon: "i-ph-file-html",
  sideEffects: false,
  inputSchema: {
    type: "object",
    properties: {
      tenantId: TENANT_INPUT,
      slug: {
        ...STRING,
        maxLength: MAX_SLUG_LENGTH,
        description: "Slug of the template",
      },
      locale: {
        ...STRING,
        maxLength: MAX_LOCALE_LENGTH,
        description:
          "Locale to render; the fallback applies when the template lacks it",
      },
      variables: {
        type: "object",
        description: "Values of the template variables",
      },
      version: {
        ...STRING,
        default: "published",
        description:
          'What to render: "published", "draft", or one past version number',
      },
      includeHtml: {
        type: "boolean",
        default: true,
        description: "Return the HTML; turn off to keep the run trace small",
      },
    },
    required: ["slug"],
  },
  outputSchema: {
    type: "object",
    properties: {
      subject: { ...STRING, description: "Rendered subject" },
      preheader: { ...STRING, description: "Rendered preheader" },
      html: {
        ...STRING,
        description: "Full HTML as a send delivers it; absent when not asked",
      },
      text: { ...STRING, description: "Plain-text part" },
      locale: { ...STRING, description: "Locale rendered" },
      version: {
        type: "number",
        minimum: 0,
        description: "Version rendered; 0 for the draft",
      },
      missing: {
        type: "array",
        items: STRING,
        description: "Variable paths with no value",
      },
    },
  },
  async execute(input) {
    const parsed = parseInput(
      RENDER_TEMPLATE_ACTION_ID,
      renderInputSchema,
      input,
    );
    const tenantId = await resolveTenant(
      RENDER_TEMPLATE_ACTION_ID,
      input.tenantId,
    );
    const { html, ...rendered } = await renderTemplate(tenantId, parsed.slug, {
      locale: parsed.locale,
      variables: parsed.variables,
      version: parsed.version,
    });
    if (!parsed.includeHtml) return rendered;
    return { ...rendered, html };
  },
};
