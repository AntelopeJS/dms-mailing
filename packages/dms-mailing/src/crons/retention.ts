import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantModel } from "@antelopejs/interface-dms/db";
import cron, { type ScheduledTask } from "node-cron";
import { SendEventModel, SendModel, SettingsModel } from "../db";

export const RETENTION_CRON_NAME = "mailing-retention";

export interface RetentionLimits {
  pageSize: number;
  maxRows: number;
}

export interface RetentionPass {
  loadPage(size: number): Promise<string[]>;
  purgeSend(sendId: string): Promise<number>;
}

/**
 * How many stale sends one pass reads at a time, and how many it retires per
 * tenant per run. What the cap leaves behind drains over the following nights.
 */
export const RETENTION_LIMITS: RetentionLimits = {
  pageSize: 500,
  maxRows: 20_000,
};

const DAY_MS = 86_400_000;
const RETENTION_SCHEDULE = "15 3 * * *";
const MIN_RETENTION_DAYS = 1;
const NO_ROWS = 0;

export function retentionLimit(days: number, now: Date): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

export async function purgeInPages(
  pass: RetentionPass,
  limits: RetentionLimits = RETENTION_LIMITS,
): Promise<number> {
  let purged = NO_ROWS;
  let inspected = NO_ROWS;
  while (inspected < limits.maxRows) {
    const size = Math.min(limits.pageSize, limits.maxRows - inspected);
    const page = await pass.loadPage(size);
    for (const sendId of page) purged += await pass.purgeSend(sendId);
    inspected += page.length;
    if (page.length < size) break;
  }
  return purged;
}

/** Replays interrupted cleanup without touching a send that became active after discovery. */
export async function purgeSend(
  tenantId: string,
  sendId: string,
  limit: Date,
): Promise<number> {
  const sends = GetModel(SendModel, tenantId);
  if (!(await sends.retire(sendId, limit))) return NO_ROWS;
  await GetModel(SendEventModel, tenantId).deleteBySend(sendId);
  return sends.deleteRetired(sendId);
}

function tenantPass(tenantId: string, limit: Date): RetentionPass {
  const sends = GetModel(SendModel, tenantId);
  return {
    async loadPage(size) {
      const stale = await sends.listOlderThan(limit, size);
      return stale.map((send) => send._id);
    },
    purgeSend: (sendId) => purgeSend(tenantId, sendId, limit),
  };
}

/** Reconciles late inserts whose writer crashed before checking the retired parent. */
export async function purgeOrphanEvents(
  tenantId: string,
  pageSize = RETENTION_LIMITS.pageSize,
): Promise<void> {
  const sends = GetModel(SendModel, tenantId);
  const events = GetModel(SendEventModel, tenantId);
  let after = "";
  for (;;) {
    const page = await events.listAfter(after, pageSize);
    for (const sendId of new Set(page.map((event) => event.sendId))) {
      if (!(await sends.get(sendId))) await events.deleteBySend(sendId);
    }
    if (page.length < pageSize) return;
    after = page[page.length - 1]._id;
  }
}

async function purgeTenant(tenantId: string, now: Date): Promise<number> {
  const settings = await GetModel(SettingsModel, tenantId).getSingleton();
  if (!settings || settings.logRetentionDays < MIN_RETENTION_DAYS) return 0;
  const limit = retentionLimit(settings.logRetentionDays, now);
  const purged = await purgeInPages(tenantPass(tenantId, limit));
  await purgeOrphanEvents(tenantId);
  return purged;
}

export async function runRetention(now: Date = new Date()): Promise<number> {
  const tenants = await GetModel(TenantModel).getAll();
  let purged = 0;
  for (const tenant of tenants) purged += await purgeTenant(tenant._id, now);
  Logging.Info(`[dms-mailing] Retention purged ${purged} sends`);
  return purged;
}

/** Stops the task and drops it from node-cron's module-level registry. */
export async function stopRetention(
  task: ScheduledTask | undefined,
): Promise<void> {
  if (!task) return;
  await task.stop();
  await task.destroy();
}

export function scheduleRetention(): ScheduledTask {
  return cron.schedule(RETENTION_SCHEDULE, () => {
    void runRetention().catch((error: unknown) => {
      Logging.Error(`Cron '${RETENTION_CRON_NAME}' failed:`, error);
    });
  });
}
