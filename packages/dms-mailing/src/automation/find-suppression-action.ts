import type {
  ActionType,
  JsonSchema,
} from "@antelopejs/interface-dms-automation";
import { z } from "zod";
import { normalizeAddress } from "../db";
import { suppressionEntryOf } from "../services/suppressions";
import { SUPPRESSION_REASONS, type SuppressionReason } from "../types";
import {
  MAX_ADDRESS_LENGTH,
  suppressionAddressSchema,
} from "../validation/suppressions.schema";
import { parseInput, TENANT_INPUT } from "./action-input";
import { resolveTenant } from "./tenant";

export type FindSuppressionInput = { tenantId?: string; email: string };

export type FindSuppressionOutput = {
  suppressed: boolean;
  suppressionId?: string;
  email: string;
  reason?: SuppressionReason;
  detail?: string;
  sendId?: string;
  createdAt?: string;
};

const FIND_SUPPRESSION_ACTION_ID = "mailing.find-suppression";

const STRING: JsonSchema = { type: "string" };

const findInputSchema = z.object({ email: suppressionAddressSchema });

export const findSuppressionAction: ActionType<
  FindSuppressionInput,
  FindSuppressionOutput
> = {
  id: FIND_SUPPRESSION_ACTION_ID,
  name: "Find suppression",
  description:
    "Tell whether an address is on a workspace's suppression list, and why",
  icon: "i-ph-magnifying-glass",
  sideEffects: false,
  inputSchema: {
    type: "object",
    properties: {
      tenantId: TENANT_INPUT,
      email: {
        ...STRING,
        format: "email",
        maxLength: MAX_ADDRESS_LENGTH,
        description: "Address to look up",
      },
    },
    required: ["email"],
  },
  outputSchema: {
    type: "object",
    properties: {
      suppressed: {
        type: "boolean",
        description: "The address is on the list",
      },
      suppressionId: { ...STRING, description: "Entry id, when suppressed" },
      email: {
        ...STRING,
        description: "Address looked up, as the list keys it",
      },
      reason: {
        ...STRING,
        enum: SUPPRESSION_REASONS,
        description: "Why, when suppressed",
      },
      detail: { ...STRING, description: "Provider's words or manual note" },
      sendId: {
        ...STRING,
        description: "Send that suppressed it; absent for a manual entry",
      },
      createdAt: { ...STRING, description: "When it was suppressed" },
    },
  },
  async execute(input) {
    const { email } = parseInput(
      FIND_SUPPRESSION_ACTION_ID,
      findInputSchema,
      input,
    );
    const tenantId = await resolveTenant(
      FIND_SUPPRESSION_ACTION_ID,
      input.tenantId,
    );
    const row = await suppressionEntryOf(tenantId, email);
    if (!row) return { suppressed: false, email: normalizeAddress(email) };
    return {
      suppressed: true,
      suppressionId: row._id,
      email: row.email,
      reason: row.reason,
      detail: row.detail || undefined,
      sendId: row.sendId || undefined,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  },
};
