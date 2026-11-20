import type { JsonSchema } from "@antelopejs/interface-dms-automation";
import {
  channelTrigger,
  TriggerChannel,
  type TriggerSettings,
} from "./emitter";

export type RetentionPurgedPayload = {
  tenantId: string;
  purged: number;
  capped: boolean;
  retentionDays: number;
  cutoff: string;
  runDay: string;
  finishedAt: string;
  deliveryId: string;
};

export interface RetentionPurgedConfig extends TriggerSettings {
  minPurged?: number;
}

const RETENTION_PURGED_TRIGGER_ID = "mailing.retention-purged";

const DEFAULT_MIN_PURGED = 1;

const accepts = (
  config: Partial<RetentionPurgedConfig>,
  payload: RetentionPurgedPayload,
): boolean => payload.purged >= (config.minPurged ?? DEFAULT_MIN_PURGED);

export const retentionPurgedChannel = new TriggerChannel<
  RetentionPurgedConfig,
  RetentionPurgedPayload
>(RETENTION_PURGED_TRIGGER_ID, accepts);

const STRING: JsonSchema = { type: "string" };

export const retentionPurgedTrigger = channelTrigger(retentionPurgedChannel, {
  name: "Send log purged",
  description:
    "Fires once per workspace when the nightly retention run deleted sends older than the workspace keeps",
  icon: "i-ph-broom",
  configProperties: {
    minPurged: {
      type: "number",
      multipleOf: 1,
      minimum: 1,
      maximum: 1_000_000,
      default: DEFAULT_MIN_PURGED,
      description: "Fire only when at least this many sends were deleted",
    },
  },
  outputProperties: {
    tenantId: { ...STRING, description: "Workspace purged" },
    purged: {
      type: "number",
      minimum: 1,
      description: "Sends deleted with their events",
    },
    capped: {
      type: "boolean",
      description:
        "The run stopped at its per-night cap; more sends go the next nights",
    },
    retentionDays: {
      type: "number",
      minimum: 1,
      description: "Days the workspace keeps its send log",
    },
    cutoff: {
      ...STRING,
      description: "Sends inactive since before this were eligible",
    },
    runDay: { ...STRING, description: "Run day, YYYY-MM-DD in UTC" },
    finishedAt: { ...STRING, description: "End of the workspace's purge" },
    deliveryId: {
      ...STRING,
      description: "Same value for a repeated delivery of one run",
    },
  },
});
