import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { MAILING_TEMPLATES_TABLE_NAME, MailingTemplate } from "../tables";

/** The attention fields of a template, as the refresh writes them. */
export type TemplateAttentionFields = Pick<
  MailingTemplate,
  "attention" | "needsAttention"
>;

export class TemplateModel extends BasicDataModel(
  MailingTemplate,
  MAILING_TEMPLATES_TABLE_NAME,
) {
  async getBySlug(slug: string): Promise<MailingTemplate | undefined> {
    const rows = await this.getBy("slug", slug);
    return rows[0];
  }

  /**
   * Writes the attention fields straight to the table: they describe the
   * template, they are no edit of it, so `updatedAt` stays where it was.
   */
  async writeAttention(
    id: string,
    fields: TemplateAttentionFields,
  ): Promise<void> {
    await this.table.get(id).update(fields).run();
  }
}
