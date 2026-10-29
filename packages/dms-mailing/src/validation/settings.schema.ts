import { domainToASCII } from "node:url";
import { z } from "zod";
import { MAX_NAME_LENGTH, SLUG_PATTERN } from "../constants";
import { LOCALIZED_TEXT_FALLBACK_LOCALE } from "@antelopejs/interface-dms-mailing";
import { MARKETING_CATEGORY } from "../engine";

export const MIN_RETENTION_DAYS = 1;
export const MAX_RETENTION_DAYS = 3650;
const MAX_LOCALE_LENGTH = 35;
const CATEGORY_ICON_PATTERN = /^i-ph-[a-z0-9-]+$/;
const CONTROL_CHARACTERS = /\p{Cc}/u;
const ADDRESS_SEPARATOR = "@";
const NO_ADDRESS = "";
/**
 * The generated secret is 48 hex characters; this floor lets an admin paste a
 * provider-issued one without letting them blank the field, which would leave
 * the unauthenticated event endpoint with no gate at all.
 */
export const MIN_WEBHOOK_SECRET_LENGTH = 32;

const messageKey = (path: string): string => `$dms_mailing.settings.${path}`;
const LABEL_REQUIRED = messageKey("categories.label_required");
const CATEGORY_DUPLICATE = messageKey("categories.label_duplicate");
const MARKETING_REQUIRED = messageKey("categories.marketing_required");
const LABEL_PART = "label";
const UNKNOWN_MOVE_TARGET = "$dms.field_errors.invalid";
export const WEBHOOK_SECRET_TOO_SHORT = messageKey(
  "fields.webhookSecret.too_short",
);

const MISSING_VARIABLES_POLICIES = ["refuse", "send"] as const;

export const categorySchema = z.object({
  id: z.string().max(MAX_NAME_LENGTH).regex(SLUG_PATTERN),
  /** One label per language (`{ en: "Orders", fr: "Commandes" }`). */
  label: z.record(z.string().trim().max(MAX_NAME_LENGTH)),
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

/** A category entry as a reader of one language sees its label. */
interface EntryInLocale {
  id: string;
  label: string;
  moveTo?: string;
}

/**
 * Every language a list labels its categories in, the fallback one first:
 * the rules below hold in each of them.
 */
function languagesOf(entries: CategoryEntry[]): string[] {
  const codes = entries.flatMap((entry) => Object.keys(entry.label));
  return [...new Set([LOCALIZED_TEXT_FALLBACK_LOCALE, ...codes])];
}

/** The entries as a reader of `locale` reads them, the fallback filling in. */
function entriesIn(entries: CategoryEntry[], locale: string): EntryInLocale[] {
  return entries.map(({ id, label, moveTo }) => ({
    id,
    label: label[locale] || label[LOCALIZED_TEXT_FALLBACK_LOCALE] || "",
    moveTo,
  }));
}

/** Why a category list is refused, and the part of it at fault. */
interface CategoryIssue {
  message: string;
  path: Array<string | number>;
}

const isKept = (entry: EntryInLocale): boolean => entry.moveTo === undefined;

/**
 * A kept entry repeating the label (whatever its case) or the id of an
 * earlier one, under the row it belongs to.
 */
function duplicateIssues(entries: EntryInLocale[]): CategoryIssue[] {
  const labels = new Set<string>();
  const ids = new Set<string>();
  const issues: CategoryIssue[] = [];
  entries.forEach((entry, index) => {
    if (!isKept(entry) || !entry.label) return;
    const label = entry.label.toLocaleLowerCase();
    if (labels.has(label))
      issues.push({ message: CATEGORY_DUPLICATE, path: [index, LABEL_PART] });
    else if (ids.has(entry.id))
      issues.push({ message: CATEGORY_DUPLICATE, path: [index, "id"] });
    labels.add(label);
    ids.add(entry.id);
  });
  return issues;
}

/**
 * A row left without a label. Checked with the whole list rather than as the
 * label's own minimum, which the form would turn into a browser-side check:
 * the server words it, under the row, together with the other row issues.
 */
function blankLabelIssues(entries: EntryInLocale[]): CategoryIssue[] {
  return entries.flatMap((entry, index) =>
    entry.label ? [] : [{ message: LABEL_REQUIRED, path: [index, LABEL_PART] }],
  );
}

function marketingIssues(kept: Set<string>): CategoryIssue[] {
  return kept.has(MARKETING_CATEGORY)
    ? []
    : [{ message: MARKETING_REQUIRED, path: [] }];
}

function moveIssues(
  entries: EntryInLocale[],
  kept: Set<string>,
): CategoryIssue[] {
  return entries.flatMap((entry, index) =>
    isKept(entry) || kept.has(entry.moveTo as string)
      ? []
      : [{ message: UNKNOWN_MOVE_TARGET, path: [index, "moveTo"] }],
  );
}

/**
 * Adds the issues of the category rows: blank labels and duplicates in each
 * language, a removed marketing category, a move to a category that is not
 * kept. Each issue is reported once per row and part, whichever language
 * shows it first.
 */
function refineCategoryEntries(
  entries: CategoryEntry[],
  context: z.RefinementCtx,
): void {
  const kept = new Set(
    entries.filter((entry) => entry.moveTo === undefined).map(({ id }) => id),
  );
  const labelIssues = languagesOf(entries).flatMap((locale) => {
    const inLocale = entriesIn(entries, locale);
    return [...blankLabelIssues(inLocale), ...duplicateIssues(inLocale)];
  });
  const seen = new Set<string>();
  [
    ...labelIssues,
    ...marketingIssues(kept),
    ...moveIssues(entriesIn(entries, LOCALIZED_TEXT_FALLBACK_LOCALE), kept),
  ]
    .filter((issue) => {
      const id = JSON.stringify(issue);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .forEach((issue) =>
      context.addIssue({ code: z.ZodIssueCode.custom, ...issue }),
    );
}

/**
 * The category list of the settings: in every language, each kept label is
 * set and unique; ids are unique, every move names a kept one, and the
 * marketing category stays.
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
