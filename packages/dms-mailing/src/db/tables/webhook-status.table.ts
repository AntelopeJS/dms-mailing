import {
  Field,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import type { WebhookRefusal } from "../../types";

export const MAILING_WEBHOOK_STATUS_TABLE_NAME = "mailing_webhook_status";

/**
 * The last request the tenant's webhook accepted and the last it refused, one
 * row keyed by the tenant id. Kept apart from the settings so a webhook call
 * never changes their revision.
 */
@RegisterTable(MAILING_WEBHOOK_STATUS_TABLE_NAME, TENANT_SCHEMA_NAME)
export class MailingWebhookStatus extends Table {
  @Field("string")
  declare _id: string;

  @Field("date")
  declare receivedAt?: Date;

  @Field("string")
  declare receivedProvider?: string;

  @Field("string")
  declare receivedType?: string;

  @Field("boolean")
  declare isReceivedMatched?: boolean;

  @Field("boolean")
  declare isReceivedTest?: boolean;

  @Field("date")
  declare refusedAt?: Date;

  @Field("string")
  declare refusedProvider?: string;

  @Field("string")
  declare refusedReason?: WebhookRefusal;
}
