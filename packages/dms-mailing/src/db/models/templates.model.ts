import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { MAILING_TEMPLATES_TABLE_NAME, MailingTemplate } from "../tables";

export class TemplateModel extends BasicDataModel(
  MailingTemplate,
  MAILING_TEMPLATES_TABLE_NAME,
) {
  async getBySlug(slug: string): Promise<MailingTemplate | undefined> {
    const rows = await this.getBy("slug", slug);
    return rows[0];
  }
}
