import {
  CreationTime,
  Field,
  RegisterTable,
  Table,
  UpdateTime,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

export const MAILING_SETTINGS_TABLE_NAME = "mailing_settings";

@RegisterTable(MAILING_SETTINGS_TABLE_NAME, TENANT_SCHEMA_NAME)
export class MailingSettings extends Table {
  @Field("string")
  declare _id: string;

  @CreationTime()
  @Field("date")
  declare createdAt: Date;

  @UpdateTime()
  @Field("date")
  declare updatedAt: Date;

  @Field("string")
  declare fallbackLocale: string;

  @Field("number")
  declare logRetentionDays: number;

  @Field("boolean")
  declare blockOnMissingVariables: boolean;

  @Field("string")
  declare senderName: string;

  @Field("string")
  declare senderEmail: string;

  @Field("string")
  declare replyTo: string;

  /** JSON-serialized TemplateCategory[] offered when classifying a template. */
  @Field("string")
  declare json_categories: string;

  @Field("string")
  declare webhookSecret: string;
}
