import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantModel } from "@antelopejs/interface-dms/db";
import { retentionPurgedChannel } from "../automation/retention-purged-trigger";
import {
  RetentionRunModel,
  SendEventModel,
  SendModel,
  SettingsModel,
} from "../db";
import type { CronJob } from "./jobs";

export interface RetentionLimits {
  pageSize: number;
  maxRows: number;
}

/** What one pass over a tenant deleted. */
export interface PurgeOutcome {
  purged: number;
  /** The pass stopped at `maxRows` on a full page: more may remain. */
  capped: boolean;
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
/** How many days of claims a tenant keeps. */
const CLAIM_KEPT_DAYS = 30;
const DAY_KEY_LENGTH = 10;

export function retentionLimit(days: number, now: Date): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/** The UTC day of `date`, `YYYY-MM-DD`: the key of a night's run. */
export function runDayOf(date: Date): string {
  return date.toISOString().slice(0, DAY_KEY_LENGTH);
}

export async function purgeInPages(
  pass: RetentionPass,
  limits: RetentionLimits = RETENTION_LIMITS,
): Promise<PurgeOutcome> {
  let purged = NO_ROWS;
  let inspected = NO_ROWS;
  while (inspected < limits.maxRows) {
    const size = Math.min(limits.pageSize, limits.maxRows - inspected);
    const page = await pass.loadPage(size);
    for (const sendId of page) purged += await pass.purgeSend(sendId);
    inspected += page.length;
    if (page.length < size) return { purged, capped: false };
  }
  return { purged, capped: true };
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

interface ClaimedRun {
  tenantId: string;
  day: string;
  retentionDays: number;
  limit: Date;
}

function announcePurge(
  run: ClaimedRun,
  outcome: PurgeOutcome,
  finishedAt: Date,
): void {
  if (outcome.purged <= NO_ROWS) return;
  retentionPurgedChannel.emit({
    tenantId: run.tenantId,
    purged: outcome.purged,
    capped: outcome.capped,
    retentionDays: run.retentionDays,
    cutoff: run.limit.toISOString(),
    runDay: run.day,
    finishedAt: finishedAt.toISOString(),
    deliveryId: `${run.tenantId}:retention:${run.day}`,
  });
}

/**
 * Purges a tenant when this instance claims its run of the night: every
 * instance runs the cron, the first to claim the tenant purges it alone and
 * fires `mailing.retention-purged` once with the full count.
 */
export async function purgeTenant(
  tenantId: string,
  now: Date,
): Promise<number> {
  const settings = await GetModel(SettingsModel, tenantId).get(tenantId);
  if (!settings || settings.logRetentionDays < MIN_RETENTION_DAYS) return 0;
  const day = runDayOf(now);
  const runs = GetModel(RetentionRunModel, tenantId);
  if (!(await runs.claim(tenantId, day))) return 0;
  const run: ClaimedRun = {
    tenantId,
    day,
    retentionDays: settings.logRetentionDays,
    limit: retentionLimit(settings.logRetentionDays, now),
  };
  const outcome = await purgeInPages(tenantPass(tenantId, run.limit));
  await purgeOrphanEvents(tenantId);
  const finishedAt = new Date();
  await runs.finish(tenantId, day, { ...outcome, finishedAt });
  await runs.dropBefore(runDayOf(retentionLimit(CLAIM_KEPT_DAYS, now)));
  announcePurge(run, outcome, finishedAt);
  return outcome.purged;
}

export async function runRetention(now: Date = new Date()): Promise<number> {
  const tenants = await GetModel(TenantModel).getAll();
  let purged = 0;
  for (const tenant of tenants) purged += await purgeTenant(tenant._id, now);
  Logging.Info(`[dms-mailing] Retention purged ${purged} sends`);
  return purged;
}

export const RETENTION_JOB: CronJob = {
  name: "mailing-retention",
  schedule: RETENTION_SCHEDULE,
  run: runRetention,
};
