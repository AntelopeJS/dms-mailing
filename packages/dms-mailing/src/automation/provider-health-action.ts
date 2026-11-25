import type {
  ActionType,
  JsonSchema,
} from "@antelopejs/interface-dms-automation";
import {
  isProviderFailing,
  providerHealthOf,
} from "../services/provider-banner";
import { readCapabilities } from "../services/provider";
import { TENANT_INPUT } from "./action-input";
import { resolveTenant } from "./tenant";

export type ProviderHealthInput = { tenantId?: string };

export type ProviderHealthOutput = {
  providerName: string;
  reachable: boolean;
  failing: boolean;
  healthy: boolean;
  recentFailures: number;
  transportFailures: number;
  suppressedFailures: number;
  recentSends: number;
  since: string;
  openTracking: boolean;
  clickTracking: boolean;
  batch: boolean;
};

const PROVIDER_HEALTH_ACTION_ID = "mailing.provider-health";

const COUNT: JsonSchema = { type: "number", minimum: 0 };
const BOOLEAN: JsonSchema = { type: "boolean" };

export const providerHealthAction: ActionType<
  ProviderHealthInput,
  ProviderHealthOutput
> = {
  id: PROVIDER_HEALTH_ACTION_ID,
  name: "Provider health",
  description:
    "Tell whether the e-mail provider answers and whether a workspace's sends of the last hour are failing",
  icon: "i-ph-plugs",
  sideEffects: false,
  inputSchema: {
    type: "object",
    properties: { tenantId: TENANT_INPUT },
  },
  outputSchema: {
    type: "object",
    properties: {
      providerName: {
        type: "string",
        description: "Provider name; empty when none is connected",
      },
      reachable: {
        ...BOOLEAN,
        description: "The provider answered its capability call",
      },
      failing: {
        ...BOOLEAN,
        description:
          "A transport failure, or at least 3 failures making 10 percent of the hour's real sends",
      },
      healthy: {
        ...BOOLEAN,
        description:
          "Reachable and not failing: the send log shows no provider banner",
      },
      recentFailures: {
        ...COUNT,
        description: "Unresolved provider failures of real sends in the hour",
      },
      transportFailures: {
        ...COUNT,
        description: "Of those, the provider could not be reached",
      },
      suppressedFailures: {
        ...COUNT,
        description: "Of those, to a suppressed address",
      },
      recentSends: { ...COUNT, description: "Real sends in the hour" },
      since: { type: "string", description: "Start of the hour window" },
      openTracking: BOOLEAN,
      clickTracking: BOOLEAN,
      batch: BOOLEAN,
    },
  },
  async execute(input) {
    const tenantId = await resolveTenant(
      PROVIDER_HEALTH_ACTION_ID,
      input.tenantId,
    );
    const [health, capabilities] = await Promise.all([
      providerHealthOf(tenantId, new Date()),
      readCapabilities(),
    ]);
    const failing = isProviderFailing(health);
    const features = capabilities?.features;
    return {
      providerName: health.providerName,
      reachable: health.providerReachable,
      failing,
      healthy: health.providerReachable && !failing,
      recentFailures: health.recentFailures,
      transportFailures: health.transportFailures,
      suppressedFailures: health.suppressedFailures,
      recentSends: health.recentSends,
      since: health.since.toISOString(),
      openTracking: features?.openTracking ?? false,
      clickTracking: features?.clickTracking ?? false,
      batch: features?.batch ?? false,
    };
  },
};
