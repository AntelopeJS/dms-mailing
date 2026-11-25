import {
  CreationTime,
  Field,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

export const MAILING_RETENTION_RUNS_TABLE_NAME = "mailing_retention_runs";

/**
 * One night's retention run of the tenant: the instance whose insert lands
 * purges the tenant that night, the others skip it.
 */
@RegisterTable(MAILING_RETENTION_RUNS_TABLE_NAME, TENANT_SCHEMA_NAME)
export class MailingRetentionRun extends Table {
  /**
   * `<tenant id>:<day>`: the tenants' rows share one key space, so the day
   * alone would let one tenant's claim refuse another's.
   */
  @Field("string")
  declare _id: string;

  /** The run's day, `YYYY-MM-DD` in UTC. */
  @Index()
  @Field("string")
  declare day: string;

  @CreationTime()
  @Field("date")
  declare claimedAt: Date;

  @Field("date")
  declare finishedAt?: Date;

  @Field("number")
  declare purged?: number;

  @Field("boolean")
  declare capped?: boolean;
}
