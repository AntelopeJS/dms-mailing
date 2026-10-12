import "./permissions";
import "./db";
import path from "node:path";
import { ImplementInterface } from "@antelopejs/interface-core";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";
import {
  registerAutomationNodes,
  unregisterAutomationNodes,
} from "./automation";
import { type DmsMailingConfig, setConfig } from "./config";
import { FRONTEND_MODULE_NAME } from "./constants";
import {
  ATTENTION_JOB,
  RETENTION_JOB,
  type ScheduledJob,
  scheduleJob,
  stopJob,
} from "./crons";
import { registerTenantExport, unregisterTenantExport } from "./hooks";
import { registerRealtimeTopics } from "./realtime";

export * from "./data";
export * from "./data-types";
export * from "./pages";
export * from "./quick-actions";
export * from "./routes";
export type { DmsMailingConfig } from "./config";

const CRON_JOBS = [RETENTION_JOB, ATTENTION_JOB];

let scheduledJobs: ScheduledJob[] = [];

export async function construct(config: DmsMailingConfig = {}): Promise<void> {
  setConfig(config);
  ImplementInterface(
    await import("@antelopejs/interface-dms-mailing"),
    await import("./implementations/dms-mailing"),
  );
  registerAutomationNodes();
  registerTenantExport();
  registerRealtimeTopics();
  await AddFrontendModule({
    name: FRONTEND_MODULE_NAME,
    sourcePath: path.join(__dirname, "../frontend-vue"),
    renderer: { name: "vue", version: "3" },
    options: { dmsMailing: {} },
    priority: 0,
  });
}

export function destroy(): void {
  unregisterAutomationNodes();
  unregisterTenantExport();
}

export function start(): void {
  scheduledJobs = CRON_JOBS.map(scheduleJob);
}

export async function stop(): Promise<void> {
  const jobs = scheduledJobs;
  scheduledJobs = [];
  await Promise.all(jobs.map(stopJob));
}
