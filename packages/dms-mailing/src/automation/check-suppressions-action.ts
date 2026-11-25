import type {
  ActionType,
  JsonSchema,
} from "@antelopejs/interface-dms-automation";
import { z } from "zod";
import { normalizeAddress } from "../db";
import { suppressionsOf } from "../services/suppressions";
import { SUPPRESSION_REASONS, type SuppressionReason } from "../types";
import {
  isSendableAddress,
  MAX_ADDRESS_LENGTH,
} from "../validation/suppressions.schema";
import { parseInput, TENANT_INPUT } from "./action-input";
import { resolveTenant } from "./tenant";

export type CheckSuppressionsInput = { tenantId?: string; emails: string[] };

type SuppressedAddress = {
  email: string;
  reason: SuppressionReason;
  suppressedAt: string;
};

export type CheckSuppressionsOutput = {
  allowed: string[];
  suppressed: SuppressedAddress[];
  invalid: string[];
  suppressedCount: number;
};

const CHECK_SUPPRESSIONS_ACTION_ID = "mailing.check-suppressions";

const MAX_CHECKED_ADDRESSES = 1000;

const checkInputSchema = z.object({
  emails: z
    .array(z.string().max(MAX_ADDRESS_LENGTH))
    .min(1)
    .max(MAX_CHECKED_ADDRESSES),
});

const STRING: JsonSchema = { type: "string" };
const STRINGS: JsonSchema = { type: "array", items: STRING };

/** The addresses given once each, compared as the list keys them, in order. */
function distinctAddresses(emails: string[]): string[] {
  const seen = new Set<string>();
  return emails.filter((email) => {
    const key = normalizeAddress(email);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const checkSuppressionsAction: ActionType<
  CheckSuppressionsInput,
  CheckSuppressionsOutput
> = {
  id: CHECK_SUPPRESSIONS_ACTION_ID,
  name: "Filter suppressed addresses",
  description:
    "Split a list of addresses into those mailing may reach and those on the suppression list",
  icon: "i-ph-funnel",
  sideEffects: false,
  inputSchema: {
    type: "object",
    properties: {
      tenantId: TENANT_INPUT,
      emails: {
        type: "array",
        items: { ...STRING, maxLength: MAX_ADDRESS_LENGTH },
        minItems: 1,
        maxItems: MAX_CHECKED_ADDRESSES,
        description: "Addresses to check",
      },
    },
    required: ["emails"],
  },
  outputSchema: {
    type: "object",
    properties: {
      allowed: {
        ...STRINGS,
        description: "Addresses not on the list, as given, in input order",
      },
      suppressed: {
        type: "array",
        description: "Addresses on the list, with the entry's reason",
        items: {
          type: "object",
          properties: {
            email: STRING,
            reason: { ...STRING, enum: SUPPRESSION_REASONS },
            suppressedAt: STRING,
          },
        },
      },
      invalid: {
        ...STRINGS,
        description:
          "Entries that are no e-mail address; neither allowed nor checked",
      },
      suppressedCount: {
        type: "number",
        minimum: 0,
        description: "How many addresses are suppressed",
      },
    },
  },
  async execute(input) {
    const { emails } = parseInput(
      CHECK_SUPPRESSIONS_ACTION_ID,
      checkInputSchema,
      input,
    );
    const tenantId = await resolveTenant(
      CHECK_SUPPRESSIONS_ACTION_ID,
      input.tenantId,
    );
    const distinct = distinctAddresses(emails);
    const invalid = distinct.filter(
      (email) => !isSendableAddress(email.trim()),
    );
    const valid = distinct.filter((email) => isSendableAddress(email.trim()));
    const entries = await suppressionsOf(tenantId, valid);
    const suppressed: SuppressedAddress[] = [];
    const allowed: string[] = [];
    for (const email of valid) {
      const row = entries.get(normalizeAddress(email));
      if (!row) allowed.push(email);
      else
        suppressed.push({
          email,
          reason: row.reason,
          suppressedAt: new Date(row.createdAt).toISOString(),
        });
    }
    return { allowed, suppressed, invalid, suppressedCount: suppressed.length };
  },
};
