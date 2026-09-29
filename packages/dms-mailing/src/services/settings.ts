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

const SECRET_BYTES = 24;

function defaults(): MailingSettingsValues {
  return {
    fallbackLocale: DEFAULT_FALLBACK_LOCALE,
    logRetentionDays: DEFAULT_LOG_RETENTION_DAYS,
    blockOnMissingVariables: false,
    senderName: "",
    senderEmail: "",
    replyTo: "",
    webhookSecret: randomBytes(SECRET_BYTES).toString("hex"),
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
