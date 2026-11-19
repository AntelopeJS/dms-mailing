import { Schema } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  CORE_SCHEMA_NAME,
  DEFAULT_TENANT_ID,
} from "@antelopejs/interface-dms/constants";
import {
  SendEventModel,
  SendModel,
  SettingsModel,
  SuppressionModel,
  TemplateModel,
  TemplateVersionModel,
  WebhookStatusModel,
} from "../../../db";

/** Every table the module's models own, in the default tenant. */
const TABLES = [
  () => GetModel(SendEventModel, DEFAULT_TENANT_ID).table,
  () => GetModel(SendModel, DEFAULT_TENANT_ID).table,
  () => GetModel(SettingsModel, DEFAULT_TENANT_ID).table,
  () => GetModel(SuppressionModel, DEFAULT_TENANT_ID).table,
  () => GetModel(TemplateModel, DEFAULT_TENANT_ID).table,
  () => GetModel(TemplateVersionModel, DEFAULT_TENANT_ID).table,
  () => GetModel(WebhookStatusModel, DEFAULT_TENANT_ID).table,
];

/** The DMS table of bell notifications, which no interface exposes a model of. */
const NOTIFICATIONS_TABLE = "user_notifications";

/**
 * Brings the default tenant back to a workspace that never opened Mailing:
 * no template, version, send, event, suppression, settings or webhook status,
 * and an empty bell, as a new database has. DMS users, roles and sessions stay.
 */
export async function resetWorkspace(): Promise<void> {
  await Promise.all(TABLES.map((table) => table().delete().run()));
  const core = Schema.list().get(CORE_SCHEMA_NAME);
  if (core === undefined) throw new Error(`no ${CORE_SCHEMA_NAME} schema`);
  await core.instance().table(NOTIFICATIONS_TABLE).delete().run();
}
