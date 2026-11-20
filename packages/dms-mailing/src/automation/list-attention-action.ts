import type {
  ActionType,
  JsonSchema,
} from "@antelopejs/interface-dms-automation";
import { z } from "zod";
import {
  type TemplateNeedingAttention,
  templatesNeedingAttention,
} from "../services/template-attention";
import { parseInput, TENANT_INPUT } from "./action-input";
import { resolveTenant } from "./tenant";
import { TEMPLATE_STATUSES } from "./template-published-trigger";

export type ListAttentionInput = {
  tenantId?: string;
  reasons?: string[];
  limit?: number;
};

export type ListAttentionOutput = {
  templates: TemplateNeedingAttention[];
  count: number;
  truncated: boolean;
};

const LIST_ATTENTION_ACTION_ID = "mailing.list-attention";

const ATTENTION_REASONS = [
  "stale_draft",
  "never_sent",
  "missing_locale",
] as const;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const listAttentionInputSchema = z.object({
  reasons: z.array(z.enum(ATTENTION_REASONS)).default([]),
  limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

const STRING: JsonSchema = { type: "string" };
const REASON: JsonSchema = { ...STRING, enum: [...ATTENTION_REASONS] };

export const listAttentionAction: ActionType<
  ListAttentionInput,
  ListAttentionOutput
> = {
  id: LIST_ATTENTION_ACTION_ID,
  name: "Templates needing attention",
  description:
    "List a workspace's mailing templates that need a look: a stale draft, a live template never sent, a missing locale",
  icon: "i-ph-warning-circle",
  sideEffects: false,
  inputSchema: {
    type: "object",
    properties: {
      tenantId: TENANT_INPUT,
      reasons: {
        type: "array",
        items: REASON,
        description: "Reasons to list. Leave empty for every reason.",
      },
      limit: {
        type: "number",
        multipleOf: 1,
        minimum: 1,
        maximum: MAX_LIMIT,
        default: DEFAULT_LIMIT,
        description: "Most templates returned",
      },
    },
  },
  outputSchema: {
    type: "object",
    properties: {
      templates: {
        type: "array",
        description: "Templates with at least one listed reason, by slug",
        items: {
          type: "object",
          properties: {
            templateId: STRING,
            slug: STRING,
            status: { ...STRING, enum: TEMPLATE_STATUSES },
            reasons: { type: "array", items: REASON },
          },
        },
      },
      count: {
        type: "number",
        minimum: 0,
        description: "Templates matching, before the limit",
      },
      truncated: {
        type: "boolean",
        description: "More templates match than the limit returned",
      },
    },
  },
  async execute(input) {
    const { reasons, limit } = parseInput(
      LIST_ATTENTION_ACTION_ID,
      listAttentionInputSchema,
      input,
    );
    const tenantId = await resolveTenant(
      LIST_ATTENTION_ACTION_ID,
      input.tenantId,
    );
    const { templates, count } = await templatesNeedingAttention(
      tenantId,
      reasons,
      limit,
    );
    return { templates, count, truncated: count > limit };
  },
};
