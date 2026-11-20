import type {
  ActionType,
  ExecutionCtx,
  JsonSchema,
} from "@antelopejs/interface-dms-automation";
import {
  type MailingSuppression,
  normalizeAddress,
  suppressionIdOf,
} from "../db";
import {
  suppressAddressAndRead,
  suppressionEntryOf,
} from "../services/suppressions";
import { SUPPRESSION_REASONS, type SuppressionReason } from "../types";
import {
  AUTOMATION_SUPPRESSION_REASONS,
  automationSuppressionSchema,
  MAX_ADDRESS_LENGTH,
  MAX_NOTE_LENGTH,
} from "../validation/suppressions.schema";
import { parseInput, TENANT_INPUT } from "./action-input";
import { runAsAutomation } from "./origin";
import { automationActor, resolveTenant } from "./tenant";

export type SuppressAddressInput = {
  tenantId?: string;
  email: string;
  reason?: string;
  detail?: string;
};

export type SuppressAddressOutput = {
  added: boolean;
  suppressionId: string;
  email: string;
  reason: SuppressionReason;
  createdAt: string;
};

const SUPPRESS_ADDRESS_ACTION_ID = "mailing.suppress-address";

const STRING: JsonSchema = { type: "string" };

const outputOf = (
  added: boolean,
  row: MailingSuppression,
): SuppressAddressOutput => ({
  added,
  suppressionId: row._id,
  email: row.email,
  reason: row.reason,
  createdAt: new Date(row.createdAt).toISOString(),
});

async function prepareCall(input: SuppressAddressInput) {
  const entry = parseInput(
    SUPPRESS_ADDRESS_ACTION_ID,
    automationSuppressionSchema,
    input,
  );
  const tenantId = await resolveTenant(
    SUPPRESS_ADDRESS_ACTION_ID,
    input.tenantId,
  );
  return { entry, tenantId };
}

async function suppress(
  input: SuppressAddressInput,
  ctx: ExecutionCtx,
): Promise<SuppressAddressOutput> {
  const { entry, tenantId } = await prepareCall(input);
  const { added, row } = await runAsAutomation(ctx, () =>
    suppressAddressAndRead(tenantId, {
      email: entry.email,
      reason: entry.reason,
      sendId: "",
      detail: entry.detail || undefined,
      createdBy: automationActor(ctx.procedureId),
    }),
  );
  if (!row)
    throw new Error(
      `${SUPPRESS_ADDRESS_ACTION_ID}: "${entry.email}" was lifted while it was being suppressed`,
    );
  return outputOf(added, row);
}

async function simulate(
  input: SuppressAddressInput,
  ctx: ExecutionCtx,
): Promise<SuppressAddressOutput> {
  const { entry, tenantId } = await prepareCall(input);
  const existing = await suppressionEntryOf(tenantId, entry.email);
  ctx.log(
    "info",
    `test run: "${entry.email}" not suppressed in tenant "${tenantId}"`,
  );
  if (existing) return outputOf(false, existing);
  return {
    added: true,
    suppressionId: suppressionIdOf(entry.email),
    email: normalizeAddress(entry.email),
    reason: entry.reason,
    createdAt: new Date().toISOString(),
  };
}

export const suppressAddressAction: ActionType<
  SuppressAddressInput,
  SuppressAddressOutput
> = {
  id: SUPPRESS_ADDRESS_ACTION_ID,
  name: "Suppress address",
  description:
    "Put an address on a workspace's suppression list so no mailing template reaches it",
  icon: "i-ph-prohibit",
  inputSchema: {
    type: "object",
    properties: {
      tenantId: TENANT_INPUT,
      email: {
        ...STRING,
        format: "email",
        maxLength: MAX_ADDRESS_LENGTH,
        description: "Address to suppress",
      },
      reason: {
        ...STRING,
        enum: [...AUTOMATION_SUPPRESSION_REASONS],
        default: "manual",
        description: "Why the address is suppressed",
      },
      detail: {
        ...STRING,
        maxLength: MAX_NOTE_LENGTH,
        description: "Note kept with the entry",
      },
    },
    required: ["email"],
  },
  outputSchema: {
    type: "object",
    properties: {
      added: {
        type: "boolean",
        description:
          "True when this call added the address; false when it was already on the list",
      },
      suppressionId: { ...STRING, description: "Entry id" },
      email: { ...STRING, description: "Address as stored" },
      reason: {
        ...STRING,
        enum: SUPPRESSION_REASONS,
        description:
          "The entry's reason; an address already on the list keeps its first one",
      },
      createdAt: { ...STRING, description: "When the entry was stored" },
    },
  },
  execute: suppress,
  dryRun: simulate,
};
