import {
  CreationTime,
  Field,
  Index,
  RegisterTable,
  Table,
  UpdateTime,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import type { TemplateStatus } from "../../types";

export const MAILING_TEMPLATES_TABLE_NAME = "mailing_templates";

@RegisterTable(MAILING_TEMPLATES_TABLE_NAME, TENANT_SCHEMA_NAME)
export class MailingTemplate extends Table {
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

  /** Version customers receive; absent on rows written before versions. */
  @Field("number")
  declare publishedVersion?: number;

  @Field("string")
  declare publishedBy?: string;

  /** JSON-serialized VariableDefinition[] declared for this template. */
  @Field("string")
  declare json_variables: string;

  /** JSON-serialized data set used by the preview and the test send. */
  @Field("string")
  declare json_test_data: string;

  /**
   * Locale codes present in the content customers receive (the draft's until
   * a first publish), comma-separated.
   * Denormalised so a template row can show its coverage without loading the
   * version. Blank on rows written before this field existed: unknown, not
   * "none".
   */
  @Field("string")
  declare locales: string;

  @Field("string")
  declare updatedBy: string;

  @Field("date")
  declare publishedAt?: Date;
}
