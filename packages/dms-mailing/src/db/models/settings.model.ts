import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { MAILING_SETTINGS_TABLE_NAME, MailingSettings } from "../tables";

export class SettingsModel extends BasicDataModel(
  MailingSettings,
  MAILING_SETTINGS_TABLE_NAME,
) {
  /**
   * The tenant's settings row, keyed by the tenant id. Rows written before the
   * key existed carry a random id and are still found by a scan.
   */
  async getSingleton(tenantId: string): Promise<MailingSettings | undefined> {
    const keyed = await this.get(tenantId);
    if (keyed) return keyed;
    const rows = await this.getAll();
    return rows[0];
  }
}
