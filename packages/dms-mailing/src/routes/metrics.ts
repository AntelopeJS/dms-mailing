import {
  Context,
  Controller,
  Get,
  Parameter,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import type { KpiCardData, TopListItem } from "@antelopejs/interface-dms/base";
import type { ComposedText } from "@antelopejs/interface-dms/base/types";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { API_BASE_PATH, HTTP_NOT_FOUND } from "../constants";
import { isMarketingCategory } from "../engine";
import {
  type SendSummary,
  type MailingTemplate,
  SendModel,
  TemplateModel,
} from "../db";
import { OverviewPageController } from "../pages/overview";
import { readCapabilities } from "../services/provider";
import { trackingOf } from "../services/send-stats";
import { localeOfRequest } from "../services/localized-text";
import { findSettings } from "../services/settings";
import { attentionFeedItem, buildAttentionItems } from "../services/attention";
import {
  aggregate,
  alignSeries,
  dailySeries,
  dailyValues,
  deltaPercent,
  domainOf,
  forAudience,
  groupBy,
  isDeliveryUntracked,
  leftForProvider,
  ratio,
  readAudience,
  type DateRange,
  type ProviderTracking,
  type Totals,
  type TotalsExtractor,
} from "../services/metrics";
import { SEND_AUDIENCE_QUERY_KEY, type SendAudience } from "../types";
import { comparisonRange, currentRange, isComparisonWanted } from "./period";

const UNKNOWN_METRIC = "$dms_mailing.errors.unknown_metric";
const TEMPLATES_PATH = "/modules/mailing/templates";
const MAX_TOP_TEMPLATES = 10;
const MAX_TOP_DOMAINS = 6;
/** Below this many deliveries a rate swings on a single e-mail: not ranked. */
export const MIN_RANKED_DELIVERIES = 5;
const DELIVERED_COUNT_KEY = "$dms_mailing.metrics.delivered_count";
const TEMPLATE_VOLUME_KEY = "$dms_mailing.metrics.template_volume";
const FIRST_ROW_OFFSET = 0;
const SINGLE_ROW = 1;

const KPI_EXTRACTORS: Record<string, TotalsExtractor> = {
  sends: (totals) => totals.sends,
  deliverability: (totals) => totals.deliverability,
  "open-rate": (totals) => totals.openRate,
  "click-rate": (totals) => totals.clickRate,
  bounces: (totals) => totals.bounced,
  unsubscribes: (totals) => totals.unsubscribed,
  queued: (totals) => totals.queued,
  latency: (totals) => totals.latencyMedian,
};

/** The KPIs read from delivery events: unmeasured when nothing reports them. */
const DELIVERY_METRICS = new Set(["deliverability", "open-rate", "click-rate"]);

export interface TopMetric {
  extract: TotalsExtractor;
  /** Deliveries a row needs before its value is ranked. */
  minDeliveries: number;
}

const TOP_METRICS: Record<string, TopMetric> = {
  "open-rate": {
    extract: (totals) => totals.openRate,
    minDeliveries: MIN_RANKED_DELIVERIES,
  },
  "click-rate": {
    extract: (totals) => totals.clickRate,
    minDeliveries: MIN_RANKED_DELIVERIES,
  },
  sends: { extract: (totals) => totals.sends, minDeliveries: 0 },
};
const DEFAULT_TOP_METRIC = TOP_METRICS["open-rate"] as TopMetric;

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
}

/** The sends of the window the figures are compared with. */
export interface ComparedWindow {
  range: DateRange;
  sends: SendSummary[];
}

/** What the Overview's first-run checklist reads. */
export interface SetupFactsResponse {
  isProviderConnected: boolean;
  isSenderSet: boolean;
  liveTemplateCount: number;
  hasTestSend: boolean;
}

export class MetricsController extends Controller(`${API_BASE_PATH}/metrics`) {
  @Context()
  declare ctx: RequestContext;

  @AuthUserWithPermission(OverviewPageController)
  declare user: User;

  @TenantScopedModel(SendModel)
  declare sends: SendModel;

  @TenantScopedModel(TemplateModel)
  declare templates: TemplateModel;

  private get tenantId(): string {
    return getRequestTenantId(this.ctx);
  }

  /** The tenant's templates, their names in the reader's language. */
  private async namedTemplates(): Promise<MailingTemplate[]> {
    const locale = localeOfRequest(this.ctx);
    const templates = await this.templates.getAll();
    return templates.map((template) => template.localize(locale, ["name"]));
  }

  /**
   * Which sends this request describes. Declared by the calling page, never
   * inferred: the Overview asks for the business view, the Sends page for the
   * operational one.
   */
  private get audience(): SendAudience {
    return readAudience(this.ctx.url.searchParams.get(SEND_AUDIENCE_QUERY_KEY));
  }

  private async load(range: DateRange): Promise<SendSummary[]> {
    const rows = await this.sends.listBetween(range.from, range.to);
    return forAudience(rows, this.audience);
  }

  /** The comparison window and its sends; `null` when the user turned it off. */
  private async loadComparison(
    range: DateRange,
  ): Promise<ComparedWindow | null> {
    if (!isComparisonWanted(this.ctx)) return null;
    const previousRange = comparisonRange(this.ctx, range);
    return { range: previousRange, sends: await this.load(previousRange) };
  }

  @Get("/kpi/:metric")
  async kpi(
    @Parameter("metric", "param") metric: string,
  ): Promise<KpiCardData> {
    const extract = KPI_EXTRACTORS[metric];
    assert(extract, HTTP_NOT_FOUND, UNKNOWN_METRIC);
    const range = currentRange(this.ctx);
    const [current, previous, tracking] = await Promise.all([
      this.load(range),
      this.loadComparison(range),
      readTracking(),
    ]);
    if (isUnmeasured(metric, current, tracking)) return {};
    const previousSends =
      previous && !isUnmeasured(metric, previous.sends, tracking)
        ? previous.sends
        : null;
    return kpiFigure(extract, current, previousSends, range);
  }

  @Get("/volume")
  async volume() {
    const range = currentRange(this.ctx);
    const [current, previous] = await Promise.all([
      this.load(range),
      this.loadComparison(range),
    ]);
    return volumeChart(current, range, previous);
  }

  @Get("/top-templates")
  async topTemplates() {
    const metric =
      TOP_METRICS[this.ctx.url.searchParams.get("metric") ?? ""] ??
      DEFAULT_TOP_METRIC;
    const [sends, templates] = await Promise.all([
      this.load(currentRange(this.ctx)),
      this.namedTemplates(),
    ]);
    const items = [...groupBy(sends, (send) => send.templateSlug)].map(
      ([slug, rows]) =>
        toTemplateItem(slug, aggregate(rows), templates, metric),
    );
    return { items: ranked(items, MAX_TOP_TEMPLATES) };
  }

  @Get("/domains")
  async domains() {
    const sends = await this.load(currentRange(this.ctx));
    const items = [
      ...groupBy(sends, (send) => domainOf(send.recipientEmail)),
    ].map(([domain, rows]) => toDomainItem(domain, aggregate(rows)));
    return { items: ranked(items, MAX_TOP_DOMAINS) };
  }

  @Get("/funnel")
  async funnel() {
    const kind = readFunnelKind(this.ctx.url.searchParams.get("kind"));
    const [sends, templates, tracking] = await Promise.all([
      this.load(currentRange(this.ctx)),
      this.namedTemplates(),
      readTracking(),
    ]);
    const kept = filterByKind(sends, templates, kind);
    return {
      steps: funnelSteps(aggregate(kept), isDeliveryUntracked(kept, tracking)),
    };
  }

  @Get("/attention")
  async attention() {
    const range = currentRange(this.ctx);
    const [templates, rows, tracking, settings] = await Promise.all([
      this.namedTemplates(),
      this.sends.listBetween(range.from, range.to),
      readTracking(),
      findSettings(this.tenantId),
    ]);
    const sends = forAudience(rows, this.audience);
    const excluded = rows.filter((row) => !sends.includes(row));
    const items = buildAttentionItems({
      templates,
      sends,
      excluded,
      windowEnd: range.to,
      tracking,
      isSenderSet: Boolean(settings?.senderEmail),
    });
    return { items: items.map(attentionFeedItem) };
  }

  /** The facts behind the Overview's first-run checklist, in one read. */
  @Get("/setup")
  async setup(): Promise<SetupFactsResponse> {
    const [capabilities, templates, settings, testSends] = await Promise.all([
      readCapabilities(),
      this.namedTemplates(),
      findSettings(this.tenantId),
      this.sends.table
        .filter((row) => row.key("isTest").eq(true))
        .slice(FIRST_ROW_OFFSET, SINGLE_ROW)
        .without("json_variables")
        .run(),
    ]);
    return {
      isProviderConnected: capabilities !== null,
      isSenderSet: Boolean(settings?.senderEmail),
      liveTemplateCount: templates.filter(
        (template) => template.status === "live",
      ).length,
      hasTestSend: testSends.length > 0,
    };
  }
}

/** A figure and its change, each left out when it cannot be stated. */
export function comparedFigure(
  value: number | null,
  previousValue: number | null,
): KpiCardData {
  const figure: KpiCardData = {};
  const delta = deltaPercent(value, previousValue);
  if (value !== null) figure.value = value;
  if (previousValue !== null) figure.previousValue = previousValue;
  if (delta !== null) figure.delta = delta;
  return figure;
}

/**
 * A KPI card's answer: the figure, its change when a comparison window is
 * read, and the figure's own daily trend as the sparkline.
 */
export function kpiFigure(
  extract: TotalsExtractor,
  current: SendSummary[],
  previous: SendSummary[] | null,
  range: DateRange,
): KpiCardData {
  const value = extract(aggregate(current));
  const previousValue = previous ? extract(aggregate(previous)) : null;
  return {
    ...comparedFigure(value, previousValue),
    sparkline: dailyValues(current, range, extract),
  };
}

/**
 * Whether a window cannot state a delivery KPI: nothing reported deliveries
 * for its sends. A previous window in that case has nothing to compare.
 */
export function isUnmeasured(
  metric: string,
  sends: SendSummary[],
  tracking: ProviderTracking | null,
): boolean {
  return DELIVERY_METRICS.has(metric) && isDeliveryUntracked(sends, tracking);
}

/**
 * The send volume chart; the comparison series overlaps the current one. A
 * suppressed send never left, so it is not counted, as in the Sends KPI.
 */
export function volumeChart(
  current: SendSummary[],
  range: DateRange,
  previous: ComparedWindow | null,
) {
  const sent = current.filter(leftForProvider);
  const previousSent = previous?.sends.filter(leftForProvider) ?? null;
  const series = dailySeries(sent, range.from, range.to);
  const comparison =
    previous && previousSent
      ? dailySeries(previousSent, previous.range.from, previous.range.to)
      : null;
  return {
    ...comparedFigure(sent.length, previousSent ? previousSent.length : null),
    series: [{ name: "$dms_mailing.metrics.sends", data: series }],
    comparisonSeries: comparison
      ? [
          {
            name: "$dms_mailing.metrics.previous",
            data: alignSeries(comparison, series),
          },
        ]
      : [],
  };
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

/** Which sends the funnel counts: all, or one side of the marketing split. */
export type FunnelKind = "all" | "marketing" | "transactional";

const FUNNEL_KINDS: Record<string, FunnelKind> = {
  all: "all",
  marketing: "marketing",
  transactional: "transactional",
};

export function readFunnelKind(raw: string | null): FunnelKind {
  return FUNNEL_KINDS[raw ?? ""] ?? "all";
}

const KIND_KEEPS: Record<FunnelKind, (category: string) => boolean> = {
  all: () => true,
  marketing: (category) => isMarketingCategory(category),
  transactional: (category) => !isMarketingCategory(category),
};

/**
 * Sends of the templates on one side of the split. A template's category
 * decides: "marketing" is the campaign side, everything else transactional.
 */
export function filterByKind(
  sends: SendSummary[],
  templates: MailingTemplate[],
  kind: FunnelKind,
): SendSummary[] {
  const categories = new Map(
    templates.map((template) => [template.slug, template.category ?? ""]),
  );
  const keeps = KIND_KEEPS[kind];
  return sends.filter((send) => keeps(categories.get(send.templateSlug) ?? ""));
}

/**
 * What the provider says it can report. An unreachable provider yields `null`
 * rather than an error: the Overview keeps its other notices, and the provider
 * card is the one that reports the outage.
 */
async function readTracking(): Promise<ProviderTracking | null> {
  return trackingOf(await readCapabilities());
}

/** The rows that can be ranked, best first, at most `limit` of them. */
export function ranked(
  items: Array<TopListItem | null>,
  limit: number,
): TopListItem[] {
  return items
    .filter((item): item is TopListItem => item !== null)
    .sort((left, right) => right.value - left.value)
    .slice(0, limit);
}

const deliveredCount = (delivered: number): ComposedText => ({
  key: DELIVERED_COUNT_KEY,
  params: { count: { type: "count", value: delivered } },
});

export function toDomainItem(
  domain: string,
  totals: Totals,
): TopListItem | null {
  if (totals.openRate === null || totals.delivered < MIN_RANKED_DELIVERIES)
    return null;
  return {
    id: domain,
    title: domain,
    description: deliveredCount(totals.delivered),
    value: totals.openRate,
  };
}

export function toTemplateItem(
  slug: string,
  totals: Totals,
  templates: MailingTemplate[],
  metric: TopMetric,
): TopListItem | null {
  const value = metric.extract(totals);
  if (value === null || totals.delivered < metric.minDeliveries) return null;
  const template = templates.find((candidate) => candidate.slug === slug);
  return {
    id: slug,
    title: template?.name ?? slug,
    description: {
      key: TEMPLATE_VOLUME_KEY,
      params: { slug, count: { type: "count", value: totals.delivered } },
    },
    value,
    to: template ? `${TEMPLATES_PATH}/${template._id}` : undefined,
  };
}
