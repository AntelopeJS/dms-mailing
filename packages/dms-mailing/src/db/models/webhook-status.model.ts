import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import {
  MAILING_WEBHOOK_STATUS_TABLE_NAME,
  MailingWebhookStatus,
} from "../tables";

type WebhookStatusPatch = Partial<Omit<MailingWebhookStatus, "_id">>;

export class WebhookStatusModel extends BasicDataModel(
  MailingWebhookStatus,
  MAILING_WEBHOOK_STATUS_TABLE_NAME,
) {
  /** Writes the tenant's row, creating it on the first call. */
  async record(tenantId: string, patch: WebhookStatusPatch): Promise<void> {
    if (await this.get(tenantId)) {
      await this.update(tenantId, patch);
      return;
    }
    try {
      await this.insert({ ...patch, _id: tenantId });
    } catch {
      await this.update(tenantId, patch);
    }
  }
}
