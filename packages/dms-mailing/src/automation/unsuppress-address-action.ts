import type {
  ActionType,
  ExecutionCtx,
  JsonSchema,
} from "@antelopejs/interface-dms-automation";
import { z } from "zod";
import { type MailingSuppression, normalizeAddress } from "../db";
import { liftSuppression, suppressionEntryOf } from "../services/suppressions";
import { SUPPRESSION_REASONS, type SuppressionReason } from "../types";
import {
  MAX_ADDRESS_LENGTH,
  suppressionAddressSchema,
} from "../validation/suppressions.schema";
import { parseInput, TENANT_INPUT } from "./action-input";
import { runAsAutomation } from "./origin";
import { automationActor, resolveTenant } from "./tenant";

export type UnsuppressAddressInput = {
  tenantId?: string;
  email: string;
  force?: boolean;
};

export type UnsuppressAddressOutput = {
  removed: boolean;
  email: string;
  wasSuppressed: boolean;
  reason?: SuppressionReason;
  refused: boolean;
};

const UNSUPPRESS_ADDRESS_ACTION_ID = "mailing.unsuppress-address";

/**
 * Reasons that record what a provider said about the address: a procedure
 * lifts them only with `force`.
 */
const PROVIDER_ASSERTED_REASONS = new Set<SuppressionReason>([
  "hard_bounce",
  "complaint",
]);

const liftInputSchema = z.object({
  email: suppressionAddressSchema,
  force: z.boolean().default(false),
});

const STRING: JsonSchema = { type: "string" };

const liftRule =
  (force: boolean) =>
  (row: MailingSuppression): boolean =>
    force || !PROVIDER_ASSERTED_REASONS.has(row.reason);

async function prepareCall(input: UnsuppressAddressInput) {
  const parsed = parseInput(
    UNSUPPRESS_ADDRESS_ACTION_ID,
    liftInputSchema,
    input,
  );
  const tenantId = await resolveTenant(
    UNSUPPRESS_ADDRESS_ACTION_ID,
    input.tenantId,
  );
  return { ...parsed, tenantId, mayLift: liftRule(parsed.force) };
}

const outputOf = (
  email: string,
  row: MailingSuppression | undefined,
  outcome: { removed: boolean; refused: boolean },
): UnsuppressAddressOutput => ({
  removed: outcome.removed,
  email: normalizeAddress(email),
  wasSuppressed: row !== undefined,
  reason: row?.reason,
  refused: outcome.refused,
});

async function lift(
  input: UnsuppressAddressInput,
  ctx: ExecutionCtx,
): Promise<UnsuppressAddressOutput> {
  const { email, tenantId, mayLift } = await prepareCall(input);
  const outcome = await runAsAutomation(ctx, () =>
    liftSuppression(
      tenantId,
      { email },
      automationActor(ctx.procedureId),
      mayLift,
    ),
  );
  return outputOf(email, outcome.row, outcome);
}

async function simulate(
  input: UnsuppressAddressInput,
  ctx: ExecutionCtx,
): Promise<UnsuppressAddressOutput> {
  const { email, tenantId, mayLift } = await prepareCall(input);
  const row = await suppressionEntryOf(tenantId, email);
  const refused = row !== undefined && !mayLift(row);
  ctx.log("info", `test run: "${email}" not lifted in tenant "${tenantId}"`);
  return outputOf(email, row, {
    removed: row !== undefined && !refused,
    refused,
  });
}

export const unsuppressAddressAction: ActionType<
  UnsuppressAddressInput,
  UnsuppressAddressOutput
> = {
  id: UNSUPPRESS_ADDRESS_ACTION_ID,
  name: "Lift suppression",
  description:
    "Take an address off a workspace's suppression list so mailing templates reach it again",
  icon: "i-ph-envelope-open",
  inputSchema: {
    type: "object",
    properties: {
      tenantId: TENANT_INPUT,
      email: {
        ...STRING,
        format: "email",
        maxLength: MAX_ADDRESS_LENGTH,
        description: "Address to lift",
      },
      force: {
        type: "boolean",
        default: false,
        description:
          "Also lift an address suppressed by a hard bounce or a spam complaint",
      },
    },
    required: ["email"],
  },
  outputSchema: {
    type: "object",
    properties: {
      removed: {
        type: "boolean",
        description: "True when this call removed the entry",
      },
      email: { ...STRING, description: "Address as the list keys it" },
      wasSuppressed: {
        type: "boolean",
        description: "The address was on the list before the call",
      },
      reason: {
        ...STRING,
        enum: SUPPRESSION_REASONS,
        description: "Reason of the entry, present when it was on the list",
      },
      refused: {
        type: "boolean",
        description:
          "True when the entry was kept because its reason needs force",
      },
    },
  },
  execute: lift,
  dryRun: simulate,
};
