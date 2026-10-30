import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { z } from "zod";
import {
  MAILING_TEMPLATE_VERSIONS_TABLE_NAME,
  type MailingTemplate,
  MailingTemplateVersion,
} from "../tables";
import { TemplateModel } from "./templates.model";

const committedVersionSchema: z.ZodType<
  MailingTemplateVersion,
  z.ZodTypeDef,
  unknown
> = z.object({
  _id: z.string(),
  templateId: z.string(),
  version: z.number(),
  json_content: z.string(),
  json_variables: z.string(),
  locales: z.string(),
  publishedAt: z.coerce.date(),
  publishedBy: z.string(),
  json_changes: z.string(),
});

/** The latest committed history row, even before its separate insert completes. */
export function committedVersionOf(
  template: Pick<MailingTemplate, "json_published_version">,
): MailingTemplateVersion | undefined {
  if (!template.json_published_version) return undefined;
  return committedVersionSchema.parse(
    JSON.parse(template.json_published_version),
  );
}

export class TemplateVersionModel extends BasicDataModel(
  MailingTemplateVersion,
  MAILING_TEMPLATE_VERSIONS_TABLE_NAME,
) {
  /** Must complete before replacing the only recoverable snapshot of this version. */
  async materialize(
    template: Pick<MailingTemplate, "json_published_version">,
  ): Promise<void> {
    const version = committedVersionOf(template);
    if (!version) return;
    if (await this.get(version._id)) return;
    try {
      await this.insert(version);
    } catch (error) {
      const stored = await this.get(version._id);
      if (!stored) throw error;
      const storedFields = new Map(Object.entries(stored));
      if (
        Object.entries(version).some(
          ([key, value]) =>
            JSON.stringify(storedFields.get(key)) !== JSON.stringify(value),
        )
      )
        throw error;
    }
  }

  /**
   * The published versions of a template, newest first. It reads the
   * template's publication before the version rows: any later publication
   * must have materialized the version that read names.
   */
  async listForTemplate(templateId: string): Promise<MailingTemplateVersion[]> {
    const template = await new TemplateModel(this.database).get(templateId);
    if (!template) return [];
    const rows = await this.getBy("templateId", templateId);
    const current = committedVersionOf(template);
    const history = rows.filter(
      (row) => row.version <= template.publishedVersion,
    );
    if (current && !history.some((row) => row.version === current.version))
      history.push(current);
    return history.sort((left, right) => right.version - left.version);
  }

  async getVersion(
    templateId: string,
    version: number,
  ): Promise<MailingTemplateVersion | undefined> {
    const rows = await this.listForTemplate(templateId);
    return rows.find((row) => row.version === version);
  }
}
