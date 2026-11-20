import { z } from "zod";

/** The longest address a mail server accepts in a path (RFC 5321). */
export const MAX_ADDRESS_LENGTH = 254;
/** The longest note kept with a manual entry. */
export const MAX_NOTE_LENGTH = 500;

/** An address as the suppression list takes it: trimmed, then checked. */
export const suppressionAddressSchema = z
  .string()
  .trim()
  .max(MAX_ADDRESS_LENGTH)
  .email();

/** An address put on the list by hand, from the dashboard. */
export const manualSuppressionSchema = z.object({
  email: z.string().trim().email(),
  note: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
});

/** The reasons a procedure may put an address on the list for. */
export const AUTOMATION_SUPPRESSION_REASONS = [
  "manual",
  "unsubscribe",
] as const;

/** An address a procedure puts on the list. */
export const automationSuppressionSchema = z.object({
  email: suppressionAddressSchema,
  reason: z.enum(AUTOMATION_SUPPRESSION_REASONS).default("manual"),
  detail: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
});

/** Whether a text is an address a send may go to. */
export const isSendableAddress = (address: string): boolean =>
  z.string().email().safeParse(address).success;
