import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import {
  MAILING_TEMPLATE_VERSIONS_TABLE_NAME,
  MailingTemplateVersion,
} from "../tables";

export class TemplateVersionModel extends BasicDataModel(
  MailingTemplateVersion,
  MAILING_TEMPLATE_VERSIONS_TABLE_NAME,
) {
  async listForTemplate(templateId: string): Promise<MailingTemplateVersion[]> {
    const rows = await this.getBy("templateId", templateId);
    return rows.sort((left, right) => right.version - left.version);
  }

  async getVersion(
    templateId: string,
    version: number,
  ): Promise<MailingTemplateVersion | undefined> {
    const rows = await this.getBy("templateId", templateId);
    return rows.find((row) => row.version === version);
  }
}
