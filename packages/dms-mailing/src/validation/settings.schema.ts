import { domainToASCII } from "node:url";
import { z } from "zod";
import { MAX_NAME_LENGTH, SLUG_PATTERN } from "../constants";
import { MARKETING_CATEGORY } from "../engine";

export const MIN_RETENTION_DAYS = 1;
export const MAX_RETENTION_DAYS = 3650;
const MAX_LOCALE_LENGTH = 35;
const CATEGORY_ICON_PATTERN = /^i-ph-[a-z0-9-]+$/;
const CONTROL_CHARACTERS = /\p{Cc}/u;
const ADDRESS_SEPARATOR = "@";
const NO_ADDRESS = "";
// The generated secret is 48 hex characters; this floor lets an admin paste a
// provider-issued one without letting them blank the field, which would leave
// the unauthenticated event endpoint with no gate at all.
export const MIN_WEBHOOK_SECRET_LENGTH = 32;

const messageKey = (path: string): string => `$dms_mailing.settings.${path}`;
const LABEL_REQUIRED = messageKey("categories.label_required");
const CATEGORY_DUPLICATE = messageKey("categories.label_duplicate");
const MARKETING_REQUIRED = messageKey("categories.marketing_required");
const UNKNOWN_MOVE_TARGET = "$dms.field_errors.invalid";
export const WEBHOOK_SECRET_TOO_SHORT = messageKey(
  "fields.webhookSecret.too_short",
);

const MISSING_VARIABLES_POLICIES = ["refuse", "send"] as const;

export const categorySchema = z.object({
  id: z.string().max(MAX_NAME_LENGTH).regex(SLUG_PATTERN),
  label: z.string().trim().min(1, LABEL_REQUIRED).max(MAX_NAME_LENGTH),
  icon: z.string().regex(CATEGORY_ICON_PATTERN),
});

/**
 * A category as the settings form sends it: a kept one, or one removed whose
 * templates go to `moveTo` (another kept category) once saved.
 */
const categoryEntrySchema = categorySchema.extend({
  moveTo: z.string().regex(SLUG_PATTERN).optional(),
});

export type CategoryEntry = z.infer<typeof categoryEntrySchema>;

/** Why a category list is refused, and the part of it at fault. */
interface CategoryIssue {
  message: string;
  path: Array<string | number>;
}

const isKept = (entry: CategoryEntry): boolean => entry.moveTo === undefined;

/**
 * A kept entry repeating the label (whatever its case) or the id of an
 * earlier one, under the row it belongs to.
 */
function duplicateIssues(entries: CategoryEntry[]): CategoryIssue[] {
  const labels = new Set<string>();
  const ids = new Set<string>();
  const issues: CategoryIssue[] = [];
  entries.forEach((entry, index) => {
    if (!isKept(entry)) return;
    const label = entry.label.toLocaleLowerCase();
    if (labels.has(label))
      issues.push({ message: CATEGORY_DUPLICATE, path: [index, "label"] });
    else if (ids.has(entry.id))
      issues.push({ message: CATEGORY_DUPLICATE, path: [index, "id"] });
    labels.add(label);
    ids.add(entry.id);
  });
  return issues;
}

function marketingIssues(kept: Set<string>): CategoryIssue[] {
  return kept.has(MARKETING_CATEGORY)
    ? []
    : [{ message: MARKETING_REQUIRED, path: [] }];
}

function moveIssues(
  entries: CategoryEntry[],
  kept: Set<string>,
): CategoryIssue[] {
  return entries.flatMap((entry, index) =>
    isKept(entry) || kept.has(entry.moveTo as string)
      ? []
      : [{ message: UNKNOWN_MOVE_TARGET, path: [index, "moveTo"] }],
  );
}

function refineCategoryEntries(
  entries: CategoryEntry[],
  context: z.RefinementCtx,
): void {
  const kept = new Set(entries.filter(isKept).map((entry) => entry.id));
  [
    ...duplicateIssues(entries),
    ...marketingIssues(kept),
    ...moveIssues(entries, kept),
  ].forEach((issue) =>
    context.addIssue({ code: z.ZodIssueCode.custom, ...issue }),
  );
}

/**
 * The category list of the settings: kept labels and ids are unique, every
 * move names a kept one, and the marketing category stays.
 */
export const categoriesSchema = z
  .array(categoryEntrySchema)
  .superRefine(refineCategoryEntries);

function isWellFormedLocale(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

/** An address as typed or pasted, its domain in the ASCII form mail uses. */
function toAsciiAddress(address: string): string {
  const separator = address.lastIndexOf(ADDRESS_SEPARATOR);
  if (separator < 0) return address;
  const domain = domainToASCII(address.slice(separator + 1));
  return domain ? `${address.slice(0, separator + 1)}${domain}` : address;
}

const optionalAddressSchema = z
  .string()
  .trim()
  .transform(toAsciiAddress)
  .pipe(z.union([z.literal(NO_ADDRESS), z.string().email()]));

export const settingsSchema = z.object({
  fallbackLocale: z
    .string()
    .trim()
    .max(MAX_LOCALE_LENGTH)
    .refine(isWellFormedLocale),
  logRetentionDays: z
    .number()
    .int()
    .min(MIN_RETENTION_DAYS)
    .max(MAX_RETENTION_DAYS),
  blockOnMissingVariables: z.boolean(),
  senderName: z
    .string()
    .trim()
    .max(MAX_NAME_LENGTH)
    .refine((value) => !CONTROL_CHARACTERS.test(value)),
  senderEmail: optionalAddressSchema,
  replyTo: optionalAddressSchema,
  webhookSecret: z
    .string()
    .min(MIN_WEBHOOK_SECRET_LENGTH, WEBHOOK_SECRET_TOO_SHORT)
    .max(MAX_NAME_LENGTH),
  categories: categoriesSchema,
});

/**
 * What a write may carry: any of the settings (`null` already turned into
 * `""` for a cleared one) and the missing-variables choice the form shows.
 * Anything else is refused.
 */
export const settingsPatchSchema = settingsSchema
  .partial()
  .extend({
    missingVariables: z.enum(MISSING_VARIABLES_POLICIES).optional(),
  })
  .strict();

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
export type SettingsInput = z.input<typeof settingsSchema>;
