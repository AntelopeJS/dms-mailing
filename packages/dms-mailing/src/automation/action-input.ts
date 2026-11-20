import type {
  JsonObject,
  JsonSchema,
} from "@antelopejs/interface-dms-automation";
import { type ZodType, type ZodTypeDef, z } from "zod";

/** The `tenantId` input every mailing action takes. */
export const TENANT_INPUT: JsonSchema = {
  type: "string",
  description: "Workspace id; empty uses the default workspace",
};

/**
 * Checks an action's input with `schema`, failing the step with the action id
 * and each refused field before anything is read or written.
 */
export function parseInput<T>(
  actionId: string,
  schema: ZodType<T, ZodTypeDef, unknown>,
  value: JsonObject,
): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
    .join("; ");
  throw new Error(`${actionId}: invalid input (${issues})`);
}

/** A date input as ISO 8601 text, absent when left empty. */
export const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "not a date" });
      return z.NEVER;
    }
    return date;
  });

/** A date as an output port carries it, absent when there is none. */
export const isoOrAbsent = (
  date: Date | undefined | null,
): string | undefined => (date ? new Date(date).toISOString() : undefined);
