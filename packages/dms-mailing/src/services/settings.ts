import { randomBytes } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { type MailingSettings, SettingsModel } from "../db";
import {
  MODULE_DEFAULT_SETTINGS,
  type MailingSettingsValues,
  type TemplateCategory,
} from "../types";
import type { JsonObject } from "../types/json";
import {
  type SettingsPatch,
  parseStoredCategories,
} from "../validation/settings.schema";

export const WEBHOOK_SECRET_BYTES = 24;

function defaults(): MailingSettingsValues {
  return {
    ...MODULE_DEFAULT_SETTINGS,
    senderName: "",
    senderEmail: "",
    replyTo: "",
    webhookSecret: randomBytes(WEBHOOK_SECRET_BYTES).toString("hex"),
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
    categories: parseStoredCategories(row.json_categories),
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
  const existing = await GetModel(SettingsModel, tenantId).get(tenantId);
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
  return getSettings(tenantId);
}

export async function saveSettings(
  tenantId: string,
  values: MailingSettingsValues,
): Promise<MailingSettingsValues> {
  const model = GetModel(SettingsModel, tenantId);
  const isStored = Boolean(await model.get(tenantId));
  if (isStored || !(await insertKeyedSettings(tenantId, values)))
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
  values: Pick<MailingSettingsValues, "blockOnMissingVariables">,
): MissingVariablesPolicy {
  return values.blockOnMissingVariables ? REFUSE_POLICY : SEND_POLICY;
}

/** The form-only field folded back into `blockOnMissingVariables`. */
const CLEARED_VALUE = "";
/** The patch with each cleared field (`null`) as the empty value it stores. */
export function clearedToEmpty(patch: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [key, value ?? CLEARED_VALUE]),
  );
}

/**
 * The settings once `patch` (the fields a form changed, cleared ones already
 * stored as empty) is laid over the stored ones, the missing-variables choice
 * folded back into its boolean.
 */
export function mergeSettingsPatch(
  current: MailingSettingsValues,
  patch: SettingsPatch,
): MailingSettingsValues {
  const { missingVariables: policy, ...written } = patch;
  const isChoice = policy === REFUSE_POLICY || policy === SEND_POLICY;
  const guard =
    isChoice && !("blockOnMissingVariables" in patch)
      ? { blockOnMissingVariables: policy === REFUSE_POLICY }
      : {};
  return { ...current, ...written, ...guard };
}
