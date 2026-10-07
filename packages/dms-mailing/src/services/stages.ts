import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantModel } from "@antelopejs/interface-dms/db";
import {
  Hook,
  type HookHandler,
  RegisterHook,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import { SendModel } from "../db";

/**
 * Fills the send log stage of every tenant's sends written before the field
 * existed. Safe to run on every start: rows that have a stage are skipped.
 */
export async function backfillSendStages(): Promise<number> {
  const tenants = await GetModel(TenantModel).getAll();
  let filled = 0;
  for (const tenant of tenants) {
    filled += await GetModel(SendModel, tenant._id).backfillStages();
  }
  if (filled) Logging.Info(`[dms-mailing] Filled the stage of ${filled} sends`);
  return filled;
}

const backfillOnDatabaseReady: HookHandler<Hook.DATABASE_INITIALIZED> = () => {
  void backfillSendStages().catch((error: unknown) => {
    Logging.Error("[dms-mailing] Send stage backfill failed:", error);
  });
  return undefined;
};

/** Runs the backfill once the DMS database is ready, now or later. */
export function registerStageBackfill(): void {
  RegisterHook(Hook.DATABASE_INITIALIZED, backfillOnDatabaseReady);
}

export function unregisterStageBackfill(): void {
  UnregisterHook(Hook.DATABASE_INITIALIZED, backfillOnDatabaseReady);
}
