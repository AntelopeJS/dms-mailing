import {
  Field,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

export const MAILING_TEMPLATE_VERSIONS_TABLE_NAME = "mailing_template_versions";

/** One published version of a template, written once and never updated. */
@RegisterTable(MAILING_TEMPLATE_VERSIONS_TABLE_NAME, TENANT_SCHEMA_NAME)
export class MailingTemplateVersion extends Table {
  @Field("string")
  declare _id: string;

  @Index()
  @Field("string")
  declare templateId: string;

  @Field("number")
  declare version: number;

  /** JSON-serialized TemplateContent of this version. */
  @Field("string")
  declare json_content: string;

  /** JSON-serialized VariableDefinition[] declared when it was published. */
  @Field("string")
  declare json_variables: string;

  @Field("string")
  declare locales: string;

  @Field("date")
  declare publishedAt: Date;

  @Field("string")
  declare publishedBy: string;

  /** JSON-serialized TemplateChange[] this version brought. */
  @Field("string")
  declare json_changes: string;
}
