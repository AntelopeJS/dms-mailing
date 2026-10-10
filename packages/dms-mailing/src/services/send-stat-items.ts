import type { StatGroupItem } from "@antelopejs/interface-dms/base";
import type {
  BlockText,
  ComposedText,
} from "@antelopejs/interface-dms/base/types";
import type { SendStats } from "./send-stats";

/** Past this wait the oldest queued send is worth a warning. */
export const QUEUE_WARNING_MS = 10 * 60_000;
/** Past this latency the figure switches to seconds. */
export const SLOW_LATENCY_MS = 5000;

const KEY = "$dms_mailing.sends.stats.";
const PERCENT = 100;
const MS_PER_SECOND = 1000;
const EMPTY_FIGURE = "—";
const PROBLEMS_PAGE = "/modules/mailing/sends?view=problems";
const PROBLEM_PARTS = ["bounced", "failed", "spam"] as const;

const key = (path: string): string => `${KEY}${path}`;

const text = (path: string, params?: ComposedText["params"]): ComposedText =>
  params ? { key: key(path), params } : { key: key(path) };

const count = (value: number) => ({ type: "count" as const, value });

const percent = (rate: number) => ({
  type: "number" as const,
  value: Math.round(rate) / PERCENT,
  format: "percent" as const,
});

/** A list of texts joined as one line ("▲ 8 % · + 3 tests, not counted"). */
function joined(parts: ComposedText[], fallback: ComposedText): BlockText {
  if (!parts.length) return fallback;
  return parts.reduce((left, right) => text("joined", { left, right }));
}

function deltaText(delta: number): ComposedText[] {
  if (!delta) return [];
  return [
    text(delta > 0 ? "delta_up" : "delta_down", {
      delta: percent(Math.abs(delta)),
    }),
  ];
}

function sendsItem(stats: SendStats): StatGroupItem {
  const tests = stats.tests
    ? [text("tests_excluded", { count: count(stats.tests) })]
    : [];
  return {
    id: "sends",
    icon: "i-ph-paper-plane-tilt",
    eyebrow: key("sends"),
    value: stats.sends,
    detail: joined(
      [...deltaText(stats.sendsDelta), ...tests],
      text("no_tests"),
    ),
  };
}

function deliveredItem(stats: SendStats): StatGroupItem {
  return {
    id: "delivered",
    icon: "i-ph-check-circle",
    eyebrow: key("delivered"),
    value: stats.sends
      ? text("rate", { rate: percent(stats.deliverability) })
      : EMPTY_FIGURE,
    detail: text("delivered_of", {
      delivered: stats.delivered,
      sends: stats.sends,
    }),
  };
}

function problemsItem(stats: SendStats): StatGroupItem {
  const parts = PROBLEM_PARTS.filter((part) => stats[part]).map((part) =>
    text(`breakdown.${part}`, { count: count(stats[part]) }),
  );
  return {
    id: "problems",
    icon: "i-ph-warning-octagon",
    tone: stats.problems ? "error" : undefined,
    eyebrow: key("problems"),
    value: stats.problems,
    detail: joined(parts, text("no_problems")),
    to: stats.problems ? PROBLEMS_PAGE : undefined,
  };
}

function queuedItem(stats: SendStats, now: number): StatGroupItem {
  const oldest = stats.oldestQueuedAt;
  const waited = oldest ? now - new Date(oldest).getTime() : 0;
  return {
    id: "queued",
    icon: "i-ph-clock",
    eyebrow: key("queued"),
    value: stats.queued,
    detail: oldest
      ? text("oldest_waiting", { time: { type: "relative", value: oldest } })
      : text("nothing_waiting"),
    detailTone: waited > QUEUE_WARNING_MS ? "warning" : undefined,
  };
}

/** The median latency in milliseconds, or in seconds past five seconds. */
export function latencyText(ms: number): ComposedText {
  if (ms < SLOW_LATENCY_MS) return text("latency_ms", { value: ms });
  return text("latency_s", {
    value: { type: "number", value: ms / MS_PER_SECOND, format: "decimal" },
  });
}

function latencyItem(stats: SendStats, provider: string): StatGroupItem {
  return {
    id: "latency",
    icon: "i-ph-timer",
    eyebrow: key("latency"),
    value: stats.sends ? latencyText(stats.latencyMedian) : EMPTY_FIGURE,
    detail: provider
      ? text("latency_detail", { provider })
      : text("latency_detail_generic"),
  };
}

/**
 * The five cells of the send log's stat strip, as `StatGroup` items whose
 * texts the DMS composes in the reader's language: sends with the tests left
 * out, deliverability, problems with their breakdown, the queue with its
 * oldest wait, and the median API latency.
 */
export function buildSendStatItems(
  stats: SendStats,
  provider: string,
  now: number = Date.now(),
): StatGroupItem[] {
  return [
    sendsItem(stats),
    deliveredItem(stats),
    problemsItem(stats),
    queuedItem(stats, now),
    latencyItem(stats, provider),
  ];
}
