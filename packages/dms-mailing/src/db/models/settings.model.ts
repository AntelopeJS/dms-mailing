import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { MAILING_SETTINGS_TABLE_NAME, MailingSettings } from "../tables";

/** The tenant's settings: a single row, keyed by the tenant id. */
export class SettingsModel extends BasicDataModel(
  MailingSettings,
  MAILING_SETTINGS_TABLE_NAME,
) {}
