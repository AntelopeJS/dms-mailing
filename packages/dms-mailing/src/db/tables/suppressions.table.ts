import {
  CreationTime,
  Field,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import type { SuppressionReason } from "../../types";

export const MAILING_SUPPRESSIONS_TABLE_NAME = "mailing_suppressions";

/**
 * An address nothing is sent to any more. Its id derives from the address, so
 * an address is on the list once whoever adds it first.
 */
@RegisterTable(MAILING_SUPPRESSIONS_TABLE_NAME, TENANT_SCHEMA_NAME)
export class MailingSuppression extends Table {
  @Field("string")
  declare _id: string;

  /** Trimmed and lower-cased. */
  @Index()
  @Field("string")
  declare email: string;

  @Field("string")
  declare reason: SuppressionReason;

  /** The send whose event put the address on the list. */
  @Field("string")
  declare sendId?: string;

  /** The provider's words (`550 5.1.1 …`) or the note of a manual entry. */
  @Field("string")
  declare detail?: string;

  /** The user who added it by hand. */
  @Field("string")
  declare createdBy?: string;

  @Index()
  @CreationTime()
  @Field("date")
  declare createdAt: Date;
}
