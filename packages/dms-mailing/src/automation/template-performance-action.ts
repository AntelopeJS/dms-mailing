import type {
  ActionType,
  JsonSchema,
} from "@antelopejs/interface-dms-automation";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { z } from "zod";
import { MAX_SLUG_LENGTH } from "../constants";
import { TemplateModel } from "../db";
import { templatePerformanceIn } from "../services/template-stats";
import { optionalDate, parseInput, TENANT_INPUT } from "./action-input";
import { slugInputSchema } from "./get-template-action";
import { requestedWindow } from "./send-stats-action";
import { resolveTenant } from "./tenant";

export type TemplatePerformanceInput = {
  tenantId?: string;
  slug: string;
  from?: string;
  to?: string;
};

export type TemplatePerformanceOutput = {
  found: boolean;
  slug: string;
  templateId?: string;
  sends?: number;
  openRate?: number;
  problems?: number;
  lastSentAt?: string;
  sources?: { source: string; count: number }[];
  fallbacks?: { requested: string; used: string; count: number }[];
};

const TEMPLATE_PERFORMANCE_ACTION_ID = "mailing.template-performance";

const DEFAULT_WINDOW_DAYS = 30;

const performanceInputSchema = z.object({
  slug: slugInputSchema,
  from: optionalDate,
  to: optionalDate,
});

const STRING: JsonSchema = { type: "string" };
const COUNT: JsonSchema = { type: "number", minimum: 0 };

export const templatePerformanceAction: ActionType<
  TemplatePerformanceInput,
  TemplatePerformanceOutput
> = {
  id: TEMPLATE_PERFORMANCE_ACTION_ID,
  name: "Template performance",
  description:
    "Figures of one mailing template's real sends over a period: sends, open rate, problems, sources and locale fallbacks",
  icon: "i-ph-chart-line-up",
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
      from: {
        ...STRING,
        format: "date-time",
        description: "Start of the period; 30 days before its end by default",
      },
      to: {
        ...STRING,
        format: "date-time",
        description: "End of the period (excluded); now by default",
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
      sends: { ...COUNT, description: "Real sends in the period" },
      openRate: {
        type: "number",
        minimum: 0,
        maximum: 100,
        description: "Percent opened",
      },
      problems: { ...COUNT, description: "Real sends with a problem status" },
      lastSentAt: { ...STRING, description: "Last real send in the period" },
      sources: {
        type: "array",
        description: "Code paths that sent it, busiest first, at most 5",
        items: {
          type: "object",
          properties: { source: STRING, count: COUNT },
        },
      },
      fallbacks: {
        type: "array",
        description: "Sends that asked for a locale the template lacked",
        items: {
          type: "object",
          properties: { requested: STRING, used: STRING, count: COUNT },
        },
      },
    },
  },
  async execute(input) {
    const { slug, from, to } = parseInput(
      TEMPLATE_PERFORMANCE_ACTION_ID,
      performanceInputSchema,
      input,
    );
    const tenantId = await resolveTenant(
      TEMPLATE_PERFORMANCE_ACTION_ID,
      input.tenantId,
    );
    const template = await GetModel(TemplateModel, tenantId).getBySlug(slug);
    if (!template) return { found: false, slug };
    const performance = await templatePerformanceIn(
      tenantId,
      template,
      requestedWindow(from, to, DEFAULT_WINDOW_DAYS),
    );
    return {
      found: true,
      slug,
      templateId: performance.id,
      sends: performance.sends,
      openRate: performance.openRate,
      problems: performance.problems,
      lastSentAt: performance.lastSentAt ?? undefined,
      sources: performance.sources,
      fallbacks: performance.fallbacks,
    };
  },
};
