import { Logging } from "@antelopejs/interface-core/logging";
import cron, { type ScheduledTask } from "node-cron";

/** A periodic job of the module: its name for the logs, when it runs, what. */
export interface CronJob {
  name: string;
  schedule: string;
  run: () => Promise<unknown>;
}

/** A job as it runs once scheduled. */
export interface ScheduledJob {
  name: string;
  task: ScheduledTask;
}

/** Schedules `job`; a failed run is logged, never thrown. */
export function scheduleJob(job: CronJob): ScheduledJob {
  const task = cron.schedule(job.schedule, () => {
    void job.run().catch((error: unknown) => {
      Logging.Error(`Cron '${job.name}' failed:`, error);
    });
  });
  return { name: job.name, task };
}

/** Stops the task and drops it from node-cron's module-level registry. */
export async function stopJob(job: ScheduledJob): Promise<void> {
  try {
    await job.task.stop();
    await job.task.destroy();
  } catch (error) {
    Logging.Error(`Cron '${job.name}' failed to stop:`, error);
  }
}
