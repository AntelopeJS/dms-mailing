import { randomUUID } from "node:crypto";
import {
  attachModifier,
  CreationTime,
  Field,
  Index,
  LocalizationModifier,
  Localized,
  Modifier,
  RegisterTable,
  Table,
  UpdateTime,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { LOCALIZED_TEXT_FALLBACK_LOCALE } from "@antelopejs/interface-dms-mailing";
import type { TemplateStatus } from "../../types";

export const MAILING_TEMPLATES_TABLE_NAME = "mailing_templates";

@RegisterTable(MAILING_TEMPLATES_TABLE_NAME, TENANT_SCHEMA_NAME)
export class MailingTemplate extends Table.with(LocalizationModifier) {
  @Field("string")
  declare _id: string;

  @CreationTime()
  @Field("date")
  declare createdAt: Date;

  @Index()
  @UpdateTime()
  @Field("date")
  declare updatedAt: Date;

  @Index()
  @Field("string")
  declare slug: string;

  /**
   * One name per language (`{ en: "Welcome", fr: "Bienvenue" }`): read it
   * after `template.localize(locale, ["name"])`, write every language at
   * once through `localize("*")`.
   */
  @Localized({ fallbackLocale: LOCALIZED_TEXT_FALLBACK_LOCALE })
  @Field("string")
  declare name: string;

  @Index()
  @Field("string")
  declare category: string;

  @Index()
  @Field("string")
  declare status: TemplateStatus;

  /**
   * JSON-serialized TemplateContent customers receive: the last published
   * version. Only a publish writes it.
   */
  @Field("string")
  declare json_content: string;

  /**
   * JSON-serialized TemplateContent the editor saves while drafting. Blank when
   * nothing is waiting to be published.
   */
  @Field("string")
  declare json_draft?: string;

  /** Whether `json_draft` holds changes customers do not receive yet. */
  @Field("boolean")
  declare isDraftPending?: boolean;

  @Field("date")
  declare draftUpdatedAt?: Date;

  @Field("string")
  declare draftUpdatedBy?: string;

  /**
   * Moves on with every write of `json_draft`; a save or a publish carrying
   * an older one is refused. 0 for a new template.
   */
  @Field("number")
  declare draftRevision: number;

  /** Version customers receive; 0 until a first publish. */
  @Field("number")
  declare publishedVersion: number;

  @Field("string")
  declare publishedBy?: string;

  /**
   * JSON-serialized VariableDefinition[] of the contract callers send
   * against: the published declarations (the working ones until a first
   * publish). Only a publish changes them on a published template.
   */
  @Field("string")
  declare json_variables: string;

  /**
   * JSON-serialized VariableDefinition[] the draft declares, published with
   * its content. Blank when the draft declares what `json_variables` does.
   */
  @Field("string")
  declare json_variables_draft?: string;

  /** JSON-serialized data set used by the preview and the test send. */
  @Field("string")
  declare json_test_data: string;

  /**
   * Locale codes present in the content customers receive (the draft's until
   * a first publish), comma-separated.
   * Denormalised so a template row can show its coverage without loading the
   * version.
   */
  @Field("string")
  declare locales: string;

  @Field("string")
  declare updatedBy: string;

  @Field("date")
  declare publishedAt?: Date;

  /**
   * Why the template needs a look (`stale_draft`, `never_sent`,
   * `missing_locale`), comma-separated; blank when nothing does. Kept by the
   * attention refresh, never by an edit.
   */
  @Field("string")
  declare attention: string;

  /** Whether `attention` names a reason: what the templates tab filters on. */
  @Index()
  @Field("boolean")
  declare needsAttention: boolean;

  /** When the template last left `live` by an unpublish. */
  @Field("date")
  declare unpublishedAt?: Date;

  /** Every semantic edit invalidates a publication's optimistic snapshot. */
  @Field("string")
  declare revision?: string;

  /**
   * Complete latest version row, committed atomically with its content. Its
   * history row can be recovered after an interrupted publication.
   */
  @Field("string")
  declare json_published_version?: string;
}

/** Covers model updates and generated data-api edits in the same database write. */
class TemplateRevisionModifier extends Modifier {
  update(object: Record<string, unknown>, field: string): void {
    object[field] = randomUUID();
  }
}

attachModifier(MailingTemplate, TemplateRevisionModifier, "revision", {});
