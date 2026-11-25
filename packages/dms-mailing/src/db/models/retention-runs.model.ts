import { IsDuplicateKeyError } from "@antelopejs/interface-database";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import {
  MAILING_RETENTION_RUNS_TABLE_NAME,
  MailingRetentionRun,
} from "../tables";

/** What a finished retention run did. */
export interface RetentionRunResult {
  purged: number;
  capped: boolean;
  finishedAt: Date;
}

/** The key of a tenant's run of `day`. */
export const retentionRunIdOf = (tenantId: string, day: string): string =>
  `${tenantId}:${day}`;

export class RetentionRunModel extends BasicDataModel(
  MailingRetentionRun,
  MAILING_RETENTION_RUNS_TABLE_NAME,
) {
  /**
   * Claims the tenant's run of `day`: one instance's insert lands, the
   * others are refused on the key.
   * @returns Whether this call claimed it
   */
  async claim(tenantId: string, day: string): Promise<boolean> {
    const id = retentionRunIdOf(tenantId, day);
    try {
      await this.insert({ _id: id, day });
      return true;
    } catch (error) {
      if (IsDuplicateKeyError(error) || (await this.get(id))) return false;
      throw error;
    }
  }

  async finish(
    tenantId: string,
    day: string,
    result: RetentionRunResult,
  ): Promise<void> {
    await this.update(retentionRunIdOf(tenantId, day), result);
  }

  /** Drops the tenant's claims of the days before `day`. */
  dropBefore(day: string): Promise<number> {
    return this.table
      .filter((row) => row.key("day").lt(day))
      .delete()
      .run();
  }
}
