import type { MailingTemplate, SendTally } from "../db";
import { isMarketingCategory } from "../engine";
import { deltaPercent, ratio, type Totals } from "./metrics";

interface FunnelStepDefinition {
  id: string;
  count: (totals: Totals) => number;
  /** What the step's rate is a share of, the base its KPI uses. */
  base: (totals: Totals) => number;
  /** Counted from events the provider reports back. */
  isDeliveryEvent: boolean;
}

const FUNNEL_STEPS: FunnelStepDefinition[] = [
  {
    id: "sent",
    count: (totals) => totals.sends,
    base: (totals) => totals.sends,
    isDeliveryEvent: false,
  },
  {
    id: "delivered",
    count: (totals) => totals.delivered,
    base: (totals) => totals.sends,
    isDeliveryEvent: true,
  },
  {
    id: "opened",
    count: (totals) => totals.opened,
    base: (totals) => totals.delivered,
    isDeliveryEvent: true,
  },
  {
    id: "clicked",
    count: (totals) => totals.clicked,
    base: (totals) => totals.delivered,
    isDeliveryEvent: true,
  },
  {
    id: "unsubscribed",
    count: (totals) => totals.unsubscribed,
    base: (totals) => totals.delivered,
    isDeliveryEvent: false,
  },
];

export interface FunnelStepResponse {
  id: string;
  label: string;
  count: number;
  /** Share of the step's base, as its KPI counts it; `null` on an empty base. */
  rate: number | null;
  /** `false` when nothing reports the events the step counts. */
  isMeasured: boolean;
  /** The step's count over the comparison window, when both measure it. */
  previousCount?: number;
  /** The change of the count, in percent; absent from an empty comparison. */
  delta?: number;
}

export function funnelSteps(
  totals: Totals,
  isUntracked: boolean,
): FunnelStepResponse[] {
  return FUNNEL_STEPS.map((step) => ({
    id: step.id,
    label: `$dms_mailing.funnel.${step.id}`,
    count: step.count(totals),
    rate: ratio(step.count(totals), step.base(totals)),
    isMeasured: !(isUntracked && step.isDeliveryEvent),
  }));
}

/**
 * The steps with their count over the comparison window, step by step. A step
 * either window does not measure states no comparison: a zero there would
 * read as a fall that never happened.
 */
export function comparedSteps(
  current: FunnelStepResponse[],
  previous: FunnelStepResponse[],
): FunnelStepResponse[] {
  return current.map((step) => {
    const before = previous.find((candidate) => candidate.id === step.id);
    if (!step.isMeasured || !before?.isMeasured) return step;
    const compared: FunnelStepResponse = {
      ...step,
      previousCount: before.count,
    };
    const delta = deltaPercent(step.count, before.count);
    if (delta !== null) compared.delta = delta;
    return compared;
  });
}

/** Which sends the funnel counts: all, or one side of the marketing split. */
export type FunnelKind = "all" | "marketing" | "transactional";

const KIND_KEEPS: Record<FunnelKind, (category: string) => boolean> = {
  all: () => true,
  marketing: (category) => isMarketingCategory(category),
  transactional: (category) => !isMarketingCategory(category),
};

const isFunnelKind = (raw: string): raw is FunnelKind =>
  Object.hasOwn(KIND_KEEPS, raw);

export function readFunnelKind(raw: string | null): FunnelKind {
  return raw !== null && isFunnelKind(raw) ? raw : "all";
}

/**
 * Sends of the templates on one side of the split. A template's category
 * decides: "marketing" is the campaign side, everything else transactional.
 */
export function filterByKind(
  sends: SendTally[],
  templates: MailingTemplate[],
  kind: FunnelKind,
): SendTally[] {
  const categories = new Map(
    templates.map((template) => [template.slug, template.category ?? ""]),
  );
  const keeps = KIND_KEEPS[kind];
  return sends.filter((send) => keeps(categories.get(String(send.key)) ?? ""));
}
