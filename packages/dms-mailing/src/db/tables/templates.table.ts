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

  @Index()
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

  /** JSON-serialized TemplateContent, replaced in place on every save. */
  @Field("string")
  declare json_content: string;

  /** JSON-serialized VariableDefinition[] declared for this template. */
  @Field("string")
  declare json_variables: string;

  /** JSON-serialized data set used by the preview and the test send. */
  @Field("string")
  declare json_test_data: string;

  /**
   * Locale codes present in the current version's content, comma-separated.
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
