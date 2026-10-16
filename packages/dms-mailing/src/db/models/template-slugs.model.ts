import { createHash } from "node:crypto";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import {
  MAILING_TEMPLATE_SLUGS_TABLE_NAME,
  MailingTemplateSlug,
} from "../tables";

const ID_LENGTH = 32;

/**
 * The id of a slug's claim, the same whoever creates the template. The tenant
 * is part of it: a driver may keep every tenant's rows in one collection,
 * where a key made of the slug alone would collide across tenants.
 */
export function templateSlugIdOf(tenantId: string, slug: string): string {
  return createHash("sha256")
    .update(`${tenantId}\n${slug}`)
    .digest("hex")
    .slice(0, ID_LENGTH);
}

export class TemplateSlugModel extends BasicDataModel(
  MailingTemplateSlug,
  MAILING_TEMPLATE_SLUGS_TABLE_NAME,
) {
  /**
   * Inserts the claim; false when the key is taken. Probed by state rather
   * than by error, since the database interface exposes no typed conflict
   * error: a claim present after a failed insert is the lost race.
   */
  async insertClaim(
    id: string,
    slug: string,
    templateId: string,
  ): Promise<boolean> {
    try {
      await this.insert({ _id: id, slug, templateId });
      return true;
    } catch (error) {
      if (await this.get(id)) return false;
      throw error;
    }
  }

  /** Drops the claim if `templateId` still holds it, never a newer one. */
  async dropClaimOf(id: string, templateId: string): Promise<void> {
    await this.table
      .atomicMutation(id, {
        type: "deleteIfEqual",
        field: "templateId",
        expectedValue: templateId,
      })
      .run();
  }

  /** Frees the slugs the templates held. */
  async releaseTemplates(templateIds: string[]): Promise<void> {
    if (!templateIds.length) return;
    await this.table.getAll(templateIds, "templateId").delete().run();
  }
}
