import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantModel } from "@antelopejs/interface-dms/db";
import { refreshTemplateAttention } from "../services/template-attention";
import type { CronJob } from "./jobs";

/**
 * Hourly: a draft turns stale and a live template's last send leaves the
 * stats window as time passes, with no write to say so.
 */
const ATTENTION_SCHEDULE = "5 * * * *";

export async function runAttentionRefresh(): Promise<void> {
  const tenants = await GetModel(TenantModel).getAll();
  for (const tenant of tenants) await refreshTemplateAttention(tenant._id);
}

export const ATTENTION_JOB: CronJob = {
  name: "mailing-attention",
  schedule: ATTENTION_SCHEDULE,
  run: runAttentionRefresh,
};
