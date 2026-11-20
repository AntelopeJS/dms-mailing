import type {
  ActionType,
  JsonSchema,
} from "@antelopejs/interface-dms-automation";
import { z } from "zod";
import { MAX_WINDOW_DAYS } from "../constants";
import type { DateRange } from "../services/metrics";
import { type SendStats, sendStatsFor } from "../services/send-stats";
import { boundedWindow, DAY_MS, previousWindow } from "../services/window";
import { optionalDate, parseInput, TENANT_INPUT } from "./action-input";
import { resolveTenant } from "./tenant";

export type SendStatsInput = {
  tenantId?: string;
  from?: string;
  to?: string;
  compare?: boolean;
};

type PreviousStats = {
  sends: number;
  deliverability?: number;
  problems: number;
  latencyMedian?: number;
};

export type SendStatsOutput = {
  from: string;
  to: string;
  sends: number;
  tests: number;
  delivered: number;
  deliverability?: number;
  isDeliveryUntracked: boolean;
  problems: number;
  bounced: number;
  failed: number;
  spam: number;
  queued: number;
  oldestQueuedAt?: string;
  latencyMedian: number;
  sendsDelta?: number;
  previous?: PreviousStats;
};

const SEND_STATS_ACTION_ID = "mailing.send-stats";

const DEFAULT_WINDOW_DAYS = 30;

const sendStatsInputSchema = z.object({
  from: optionalDate,
  to: optionalDate,
  compare: z.boolean().default(false),
});

const STRING: JsonSchema = { type: "string" };
const COUNT: JsonSchema = { type: "number", minimum: 0 };

/**
 * The window a procedure asks for, by the send log's rules: 30 days to now
 * by default, reversed bounds swapped, at most 400 days.
 */
export function requestedWindow(
  from: Date | undefined,
  to: Date | undefined,
  defaultDays: number,
): DateRange {
  const end = to ?? new Date();
  const start = from ?? new Date(end.getTime() - defaultDays * DAY_MS);
  return boundedWindow(start, end);
}

const orAbsent = <T>(value: T | null): T | undefined => value ?? undefined;

function statsOutput(range: DateRange, stats: SendStats): SendStatsOutput {
  const { compared } = stats;
  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    sends: stats.sends,
    tests: stats.tests,
    delivered: stats.delivered,
    deliverability: orAbsent(stats.deliverability),
    isDeliveryUntracked: stats.isDeliveryUntracked,
    problems: stats.problems,
    bounced: stats.bounced,
    failed: stats.failed,
    spam: stats.spam,
    queued: stats.queued,
    oldestQueuedAt: orAbsent(stats.oldestQueuedAt),
    latencyMedian: stats.latencyMedian,
    sendsDelta: orAbsent(stats.sendsDelta),
    previous: compared
      ? {
          sends: compared.sends,
          deliverability: orAbsent(compared.deliverability),
          problems: compared.problems,
          latencyMedian: orAbsent(compared.latencyMedian),
        }
      : undefined,
  };
}

export const sendStatsAction: ActionType<SendStatsInput, SendStatsOutput> = {
  id: SEND_STATS_ACTION_ID,
  name: "Send statistics",
  description:
    "Count a workspace's sends, deliveries and problems over a period, as the send log's figures show them",
  icon: "i-ph-chart-bar",
  sideEffects: false,
  inputSchema: {
    type: "object",
    properties: {
      tenantId: TENANT_INPUT,
      from: {
        ...STRING,
        format: "date-time",
        description: `Start of the period; 30 days before its end by default, at most ${MAX_WINDOW_DAYS} days`,
      },
      to: {
        ...STRING,
        format: "date-time",
        description: "End of the period (excluded); now by default",
      },
      compare: {
        type: "boolean",
        default: false,
        description: "Also compute the previous period of the same length",
      },
    },
  },
  outputSchema: {
    type: "object",
    properties: {
      from: { ...STRING, description: "Effective start" },
      to: { ...STRING, description: "Effective end" },
      sends: { ...COUNT, description: "Real sends" },
      tests: { ...COUNT, description: "Test sends, not in sends" },
      delivered: { ...COUNT, description: "Delivered real sends" },
      deliverability: {
        type: "number",
        minimum: 0,
        maximum: 100,
        description: "Percent delivered; absent without a real send",
      },
      isDeliveryUntracked: {
        type: "boolean",
        description:
          "The provider reports no delivery; deliverability would mislead",
      },
      problems: {
        ...COUNT,
        description: "Unresolved bounced, failed and spam sends",
      },
      bounced: COUNT,
      failed: COUNT,
      spam: COUNT,
      queued: COUNT,
      oldestQueuedAt: { ...STRING, description: "Oldest send still queued" },
      latencyMedian: { ...COUNT, description: "Median send latency, in ms" },
      sendsDelta: {
        type: "number",
        description:
          "Change of sends against the previous period, in percent; with compare",
      },
      previous: {
        type: "object",
        description: "Previous-period figures; with compare",
        properties: {
          sends: COUNT,
          deliverability: { type: "number" },
          problems: COUNT,
          latencyMedian: COUNT,
        },
      },
    },
  },
  async execute(input) {
    const { from, to, compare } = parseInput(
      SEND_STATS_ACTION_ID,
      sendStatsInputSchema,
      input,
    );
    const tenantId = await resolveTenant(SEND_STATS_ACTION_ID, input.tenantId);
    const range = requestedWindow(from, to, DEFAULT_WINDOW_DAYS);
    const stats = await sendStatsFor(
      tenantId,
      range,
      compare ? previousWindow(range) : null,
    );
    return statsOutput(range, stats);
  },
};
