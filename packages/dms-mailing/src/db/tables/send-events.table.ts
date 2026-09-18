import {
  Field,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import type { SendEventType } from "../../types";

export const MAILING_SEND_EVENTS_TABLE_NAME = "mailing_send_events";

@RegisterTable(MAILING_SEND_EVENTS_TABLE_NAME, TENANT_SCHEMA_NAME)
export class MailingSendEvent extends Table {
  @Field("string")
  declare _id: string;

  @Index()
  @Field("string")
  declare sendId: string;

  @Field("string")
  declare type: SendEventType;

  @Index()
  @Field("date")
  declare at: Date;

  /** JSON-serialized SendEventDetails reported by the provider. */
  @Field("string")
  declare json_details: string;
}
