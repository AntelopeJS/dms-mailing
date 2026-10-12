import {
  CreationTime,
  Field,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import type { SendStage, SendStatus } from "../../types";

export const MAILING_SENDS_TABLE_NAME = "mailing_sends";

@RegisterTable(MAILING_SENDS_TABLE_NAME, TENANT_SCHEMA_NAME)
export class MailingSend extends Table {
  @Field("string")
  declare _id: string;

  @Index()
  @CreationTime()
  @Field("date")
  declare createdAt: Date;

  @Field("string")
  declare templateId: string;

  @Index()
  @Field("string")
  declare templateSlug: string;

  /** Locale the e-mail was rendered in. */
  @Field("string")
  declare locale: string;

  /** Locale the caller asked for; differs from `locale` on a fallback. */
  @Field("string")
  declare requestedLocale: string;

  /** Template version the send used; 0 for a test send of a draft. */
  @Field("number")
  declare templateVersion: number;

  @Index()
  @Field("string")
  declare recipientEmail: string;

  @Field("string")
  declare recipientName?: string;

  @Index()
  @Field("string")
  declare status: SendStatus;

  /** The send log tab a status belongs to, derived from `status`. */
  @Index()
  @Field("string")
  declare stage: SendStage;

  @Field("string")
  declare provider?: string;

  @Index()
  @Field("string")
  declare providerMessageId?: string;

  /** `null` for a send that never reached the provider (suppressed). */
  @Field("number")
  declare latencyMs: number | null;

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

  /** A bounce the receiving server called temporary (a full mailbox, 4.x.x). */
  @Field("boolean")
  declare isSoftBounce?: boolean;

  /** The send this one repeats, sent again or to another address. */
  @Field("string")
  declare replayOf?: string;

  /** The send that repeated this problem, once someone sent it again. */
  @Field("string")
  declare replayedBy?: string;

  /** When someone dealt with this problem by sending it again. */
  @Field("date")
  declare resolvedAt?: Date;

  /** Who sent it again: a user id. */
  @Field("string")
  declare resolvedBy?: string;
}
