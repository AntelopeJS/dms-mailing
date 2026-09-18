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

export async function getSettings(
  tenantId: string,
): Promise<MailingSettingsValues> {
  const model = GetModel(SettingsModel, tenantId);
  const existing = await model.getSingleton();
  if (existing) return toValues(existing);
  const created = defaults();
  await model.insert(toRow(created));
  return created;
}

export async function saveSettings(
  tenantId: string,
  values: MailingSettingsValues,
): Promise<MailingSettingsValues> {
  const model = GetModel(SettingsModel, tenantId);
  const existing = await model.getSingleton();
  if (existing) await model.update(existing._id, toRow(values));
  else await model.insert(toRow(values));
  return values;
}

export function findCategory(
  categories: TemplateCategory[],
  id: string,
): TemplateCategory | undefined {
  return categories.find((category) => category.id === id);
}
