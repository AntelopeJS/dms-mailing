import { randomBytes } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  DEFAULT_FALLBACK_LOCALE,
  DEFAULT_LOG_RETENTION_DAYS,
} from "../constants";
import { type MailingSettings, SettingsModel } from "../db";
import {
  DEFAULT_CATEGORIES,
  type MailingSettingsValues,
  type TemplateCategory,
} from "../types";

export const WEBHOOK_SECRET_BYTES = 24;

function defaults(): MailingSettingsValues {
  return {
    fallbackLocale: DEFAULT_FALLBACK_LOCALE,
    logRetentionDays: DEFAULT_LOG_RETENTION_DAYS,
    blockOnMissingVariables: false,
    senderName: "",
    senderEmail: "",
    replyTo: "",
    webhookSecret: randomBytes(WEBHOOK_SECRET_BYTES).toString("hex"),
    categories: DEFAULT_CATEGORIES,
  };
}

function toValues(row: MailingSettings): MailingSettingsValues {
  return {
    fallbackLocale: row.fallbackLocale,
    logRetentionDays: row.logRetentionDays,
    blockOnMissingVariables: row.blockOnMissingVariables,
    senderName: row.senderName,
    senderEmail: row.senderEmail,
    replyTo: row.replyTo,
    webhookSecret: row.webhookSecret,
    categories: JSON.parse(row.json_categories) as TemplateCategory[],
  };
}

function toRow(values: MailingSettingsValues): Partial<MailingSettings> {
  const { categories, ...rest } = values;
  return { ...rest, json_categories: JSON.stringify(categories) };
}

/** The tenant's stored settings, without creating them when there are none. */
export async function findSettings(
  tenantId: string,
): Promise<MailingSettingsValues | undefined> {
  const existing = await GetModel(SettingsModel, tenantId).getSingleton(
    tenantId,
  );
  return existing ? toValues(existing) : undefined;
}

/**
 * Creates the tenant's row under its tenant id, so two concurrent first
 * readers cannot both insert one: the loser's insert is refused on the key.
 * Resolves false when another writer created the row first.
 */
async function insertKeyedSettings(
  tenantId: string,
  values: MailingSettingsValues,
): Promise<boolean> {
  const model = GetModel(SettingsModel, tenantId);
  try {
    await model.insert({ ...toRow(values), _id: tenantId });
    return true;
  } catch (error) {
    if (await model.get(tenantId)) return false;
    throw error;
  }
}

export async function getSettings(
  tenantId: string,
): Promise<MailingSettingsValues> {
  const existing = await findSettings(tenantId);
  if (existing) return existing;
  const created = defaults();
  if (await insertKeyedSettings(tenantId, created)) return created;
  return (await findSettings(tenantId)) as MailingSettingsValues;
}

export async function saveSettings(
  tenantId: string,
  values: MailingSettingsValues,
): Promise<MailingSettingsValues> {
  const model = GetModel(SettingsModel, tenantId);
  const existing = await model.getSingleton(tenantId);
  if (existing) await model.update(existing._id, toRow(values));
  else if (!(await insertKeyedSettings(tenantId, values)))
    await model.update(tenantId, toRow(values));
  return values;
}

export function findCategory(
  categories: TemplateCategory[],
  id: string,
): TemplateCategory | undefined {
  return categories.find((category) => category.id === id);
}

/** What a send does when a variable it needs is missing. */
export type MissingVariablesPolicy = "refuse" | "send";

const REFUSE_POLICY: MissingVariablesPolicy = "refuse";
const SEND_POLICY: MissingVariablesPolicy = "send";

export function missingVariablesPolicy(
  values: MailingSettingsValues,
): MissingVariablesPolicy {
  return values.blockOnMissingVariables ? REFUSE_POLICY : SEND_POLICY;
}

const DERIVED_KEYS = new Set(["webhookUrl", "provider", "missingVariables"]);
const CLEARED_VALUE = "";

/**
 * The settings once `patch` (the fields a form changed, `null` for a cleared
 * one) is laid over the stored ones. Read-only derived fields are ignored and
 * the missing-variables choice is folded back into its boolean.
 */
export function mergeSettingsPatch(
  current: MailingSettingsValues,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const written = Object.fromEntries(
    Object.entries(patch)
      .filter(([key]) => !DERIVED_KEYS.has(key))
      .map(([key, value]) => [key, value ?? CLEARED_VALUE]),
  );
  const policy = patch.missingVariables;
  const isChoice = policy === REFUSE_POLICY || policy === SEND_POLICY;
  const guard =
    isChoice && !("blockOnMissingVariables" in patch)
      ? { blockOnMissingVariables: policy === REFUSE_POLICY }
      : {};
  return { ...current, ...written, ...guard };
}
