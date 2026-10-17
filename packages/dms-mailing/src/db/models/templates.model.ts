import { randomUUID } from "node:crypto";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { MAILING_TEMPLATES_TABLE_NAME, MailingTemplate } from "../tables";
import { TemplateSlugModel } from "./template-slugs.model";

/** The attention fields of a template, as the refresh writes them. */
export type TemplateAttentionFields = Pick<
  MailingTemplate,
  "attention" | "needsAttention"
>;

export class TemplateModel extends BasicDataModel(
  MailingTemplate,
  MAILING_TEMPLATES_TABLE_NAME,
) {
  /** Publishes only over the exact semantic revision that was inspected. */
  async publishIfCurrent(
    template: MailingTemplate,
    patch: Partial<MailingTemplate>,
  ): Promise<boolean> {
    const outcome = await this.table
      .atomicMutation(template._id, {
        type: "update",
        revisionField: "revision",
        expectedRevision: template.revision ?? { kind: "missing" },
        nextRevision: randomUUID(),
        patch: { ...patch, updatedAt: new Date() },
      })
      .run();
    if (outcome === "unknown")
      throw new Error("Mailing publication outcome is unknown; not retrying");
    return outcome === "applied";
  }

  async getBySlug(slug: string): Promise<MailingTemplate | undefined> {
    const rows = await this.getBy("slug", slug);
    // A losing creation can still be cleaning up (or its process can crash).
    // Senders must see the claimed template, not an earlier draft candidate.
    if (rows.length > 1) {
      const claims = await new TemplateSlugModel(this.database).getBy(
        "templateId",
        ...rows.map((row) => row._id),
      );
      const claim = claims.find((candidate) => candidate.slug === slug);
      if (claim) return rows.find((row) => row._id === claim.templateId);
    }
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
