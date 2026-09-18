import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { MAILING_SETTINGS_TABLE_NAME, MailingSettings } from "../tables";

export class SettingsModel extends BasicDataModel(
  MailingSettings,
  MAILING_SETTINGS_TABLE_NAME,
) {
  async getSingleton(): Promise<MailingSettings | undefined> {
    const rows = await this.getAll();
    return rows[0];
  }
}
