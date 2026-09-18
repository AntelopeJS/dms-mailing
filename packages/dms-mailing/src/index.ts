import "./permissions";
import "./db";
import path from "node:path";
import { ImplementInterface } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";
import type { ScheduledTask } from "node-cron";
import {
  registerAutomationNodes,
  unregisterAutomationNodes,
} from "./automation";
import { type DmsMailingConfig, setConfig } from "./config";
import { FRONTEND_MODULE_NAME } from "./constants";
import { RETENTION_CRON_NAME, scheduleRetention, stopRetention } from "./crons";
import { registerTenantExport, unregisterTenantExport } from "./hooks";
import { registerRealtimeTopics } from "./realtime";

export * from "./data";
export * from "./data-types";
export * from "./pages";
export * from "./quick-actions";
export * from "./routes";
export type { DmsMailingConfig } from "./config";

let retentionTask: ScheduledTask | undefined;

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
  retentionTask = scheduleRetention();
}

export async function stop(): Promise<void> {
  const task = retentionTask;
  retentionTask = undefined;
  try {
    await stopRetention(task);
  } catch (error) {
    Logging.Error(`Cron '${RETENTION_CRON_NAME}' failed to stop:`, error);
  }
}
