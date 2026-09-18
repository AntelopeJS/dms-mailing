import {
  CreationTime,
  Field,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import type { SendStatus } from "../../types";

export const MAILING_SENDS_TABLE_NAME = "mailing_sends";

@RegisterTable(MAILING_SENDS_TABLE_NAME, TENANT_SCHEMA_NAME)
export class MailingSend extends Table {
  @Field("string")
  declare _id: string;

  @Index()
  @CreationTime()
  @Field("date")
  declare createdAt: Date;

  @Index()
  @Field("string")
  declare templateId: string;

  @Index()
  @Field("string")
  declare templateSlug: string;

  @Field("string")
  declare locale: string;

  @Index()
  @Field("string")
  declare recipientEmail: string;

  @Field("string")
  declare recipientName?: string;

  @Index()
  @Field("string")
  declare status: SendStatus;

  @Field("string")
  declare provider?: string;

  @Index()
  @Field("string")
  declare providerMessageId?: string;

  @Field("number")
  declare latencyMs: number;

  @Field("string")
  declare error?: string;

  @Field("string")
  declare source?: string;

  /** JSON-serialized variables the template was rendered with. */
  @Field("string")
  declare json_variables: string;

  @Field("number")
  declare opens: number;

  @Field("number")
  declare clicks: number;

  @Field("date")
  declare lastEventAt?: Date;

  @Field("date")
  declare lastActivityAt?: Date;

  @Field("string")
  declare revision: string;

  @Field("boolean")
  declare isRetiring?: boolean;

  @Field("boolean")
  declare isTest: boolean;
}
