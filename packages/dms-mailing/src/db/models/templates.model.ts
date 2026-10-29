import { randomUUID } from "node:crypto";
import {
  BasicDataModel,
  triggerEvent,
} from "@antelopejs/interface-database-decorators";
import type { LocalizedText } from "@antelopejs/interface-dms-mailing";
import { MAILING_TEMPLATES_TABLE_NAME, MailingTemplate } from "../tables";
import { isText } from "../../validation/guards";

/** The attention fields of a template, as the refresh writes them. */
export type TemplateAttentionFields = Pick<
  MailingTemplate,
  "attention" | "needsAttention"
>;

const isLocalizedText = (value: unknown): value is LocalizedText =>
  typeof value === "object" &&
  value !== null &&
  Object.values(value).every(isText);

/** Where a row keeps its modifier-held fields, the localized name among them. */
const MODIFIER_CONTAINER = "_internal";

/**
 * Template fields as code writes them: the name holds every language
 * (`{ en: "Welcome", fr: "Bienvenue" }`).
 */
export type TemplateFields = Omit<Partial<MailingTemplate>, "name"> & {
  name?: LocalizedText;
};

export class TemplateModel extends BasicDataModel(
  MailingTemplate,
  MAILING_TEMPLATES_TABLE_NAME,
) {
  /** The row of `fields`, its name written in every language it holds. */
  static fromFields(fields: TemplateFields): MailingTemplate {
    return TemplateModel.fromPlainData(fields).localize("*", ["name"]);
  }

  /**
   * The names of `template`, one per language: unlocked with `"*"`, the
   * localized field holds the whole per-language record.
   */
  static namesOf(template: MailingTemplate): LocalizedText {
    const names: unknown = template.localize("*", ["name"]).name;
    return isLocalizedText(names) ? names : {};
  }

  /** The name of `template` in `locale`, else in the fallback language. */
  static nameIn(template: MailingTemplate, locale: string): string {
    return template.localize(locale, ["name"]).name ?? "";
  }

  /** Inserts a template whose name holds every language. */
  insertFields(fields: TemplateFields) {
    return this.insert(TemplateModel.fromFields(fields));
  }

  /**
   * Updates a template, a name given holding every language. Every write of
   * a template goes through here rather than `update`: an update event leaves
   * the row's modifier container (`_internal`, where the localized name
   * lives) empty when the patch has no name, and the database merges a row
   * shallowly, so that empty container would wipe the stored name.
   */
  updateFields(id: string, fields: TemplateFields): Promise<number> {
    const row = TemplateModel.fromFields(fields);
    triggerEvent(row, "update");
    const stored = TemplateModel.toDatabase(row);
    if (fields.name === undefined) delete stored[MODIFIER_CONTAINER];
    return this.table.get(id).update(stored).run();
  }

  /** Publishes only over the exact semantic revision that was inspected. */
  async publishIfCurrent(
    template: MailingTemplate,
    patch: TemplateFields,
  ): Promise<boolean> {
    const stored = TemplateModel.toDatabase(TemplateModel.fromFields(patch));
    const outcome = await this.table
      .atomicMutation(template._id, {
        type: "update",
        revisionField: "revision",
        expectedRevision: template.revision ?? { kind: "missing" },
        nextRevision: randomUUID(),
        patch: { ...stored, updatedAt: new Date() },
      })
      .run();
    if (outcome === "unknown")
      throw new Error("Mailing publication outcome is unknown; not retrying");
    return outcome === "applied";
  }

  /** The template holding `slug`: the unique index keeps it to one. */
  async getBySlug(slug: string): Promise<MailingTemplate | undefined> {
    const [template] = await this.getBy("slug", slug);
    return template;
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
