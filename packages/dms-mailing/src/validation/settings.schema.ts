import { z } from "zod";
import { MAX_NAME_LENGTH } from "../constants";

const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 3650;
const LOCALE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;
// The generated secret is 48 hex characters; this floor lets an admin paste a
// provider-issued one without letting them blank the field, which would leave
// the unauthenticated event endpoint with no gate at all.
const MIN_WEBHOOK_SECRET_LENGTH = 32;

export const categorySchema = z.object({
  id: z.string().min(1).max(MAX_NAME_LENGTH),
  label: z.string().min(1).max(MAX_NAME_LENGTH),
  icon: z.string().min(1),
});

export const settingsSchema = z.object({
  fallbackLocale: z.string().regex(LOCALE_PATTERN),
  logRetentionDays: z
    .number()
    .int()
    .min(MIN_RETENTION_DAYS)
    .max(MAX_RETENTION_DAYS),
  blockOnMissingVariables: z.boolean(),
  senderName: z.string().max(MAX_NAME_LENGTH).default(""),
  senderEmail: z.union([z.string().email(), z.literal("")]).default(""),
  replyTo: z.union([z.string().email(), z.literal("")]).default(""),
  webhookSecret: z.string().min(MIN_WEBHOOK_SECRET_LENGTH).max(MAX_NAME_LENGTH),
  categories: z.array(categorySchema).default([]),
});

export type SettingsInput = z.input<typeof settingsSchema>;
