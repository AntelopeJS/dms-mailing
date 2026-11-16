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
import {
  type MailingTemplate,
  type SendScope,
  SendModel,
  type SendTally,
  type TallyGroup,
  type TallyKey,
  TemplateModel,
} from "../db";
import { OverviewPageController } from "../pages/overview";
import {
  comparedSteps,
  filterByKind,
  type FunnelStepResponse,
  funnelSteps,
  readFunnelKind,
} from "../services/funnel";
import { readCapabilities } from "../services/provider";
import { trackingOf } from "../services/send-stats";
import { localeOfRequest } from "../services/localized-text";
import { findSettings } from "../services/settings";
import { attentionFeedItem, buildAttentionItems } from "../services/attention";
import {
  aggregate,
  alignSeries,
  countOf,
  dailyLatencies,
  dailySeries,
  dailyValues,
  deltaPercent,
  forAudience,
  groupBy,
  isDeliveryUntracked,
  latencyMedian,
  leavesOutTests,
  leftForProvider,
  readAudience,
  tallyGroups,
  type DateRange,
  type ProviderTracking,
  type Totals,
  type TotalsExtractor,
} from "../services/metrics";
import { SEND_AUDIENCE_QUERY_KEY, type SendAudience } from "../types";
import {
  comparisonLabel,
  comparisonRange,
  currentRange,
  isComparisonWanted,
} from "./period";

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

const KPI_EXTRACTORS = new Map<string, TotalsExtractor>([
  ["sends", (totals) => totals.sends],
  ["deliverability", (totals) => totals.deliverability],
  ["open-rate", (totals) => totals.openRate],
  ["click-rate", (totals) => totals.clickRate],
  ["bounces", (totals) => totals.bounced],
  ["unsubscribes", (totals) => totals.unsubscribed],
  ["queued", (totals) => totals.queued],
]);

/** The KPI read from each send's latency rather than from the tallies. */
const LATENCY_METRIC = "latency";

const BY_TEMPLATE: TallyGroup = { by: "template" };
const BY_DOMAIN: TallyGroup = { by: "domain" };

/** A window's sends counted per day, day 0 being the window's first. */
const byDay = (range: DateRange): TallyGroup => ({
  by: "day",
  from: range.from,
});

/** The KPIs read from delivery events: unmeasured when nothing reports them. */
const DELIVERY_METRICS = new Set(["deliverability", "open-rate", "click-rate"]);

export interface TopMetric {
  extract: TotalsExtractor;
  /** Deliveries a row needs before its value is ranked. */
  minDeliveries: number;
}

const OPEN_RATE_METRIC: TopMetric = {
  extract: (totals) => totals.openRate,
  minDeliveries: MIN_RANKED_DELIVERIES,
};

const TOP_METRICS = new Map<string, TopMetric>([
  ["open-rate", OPEN_RATE_METRIC],
  [
    "click-rate",
    {
      extract: (totals) => totals.clickRate,
      minDeliveries: MIN_RANKED_DELIVERIES,
    },
  ],
  ["sends", { extract: (totals) => totals.sends, minDeliveries: 0 }],
]);
const DEFAULT_TOP_METRIC = OPEN_RATE_METRIC;

/** The sends of the window the figures are compared with. */
export interface ComparedWindow {
  range: DateRange;
  sends: SendTally[];
  /** What the comparison series is called: the previous period, year… */
  label: string;
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

  private scopeOf(range: DateRange): SendScope {
    return {
      from: range.from,
      to: range.to,
      isTestLeftOut: leavesOutTests(this.audience),
    };
  }

  /** The window's sends of this audience, tallied per `group` of the window. */
  private load(
    range: DateRange,
    group: (range: DateRange) => TallyGroup,
  ): Promise<SendTally[]> {
    return this.sends.tally(this.scopeOf(range), group(range));
  }

  /** The comparison window and its sends; `null` when the user turned it off. */
  private async loadComparison(
    range: DateRange,
    group: (range: DateRange) => TallyGroup,
  ): Promise<ComparedWindow | null> {
    if (!isComparisonWanted(this.ctx)) return null;
    const previousRange = comparisonRange(this.ctx, range);
    return {
      range: previousRange,
      sends: await this.load(previousRange, group),
      label: comparisonLabel(this.ctx),
    };
  }

  /**
   * The latency KPI: a median, which the database cannot compute, so it
   * reads the latency of every send of the window.
   */
  private async latencyKpi(range: DateRange): Promise<KpiCardData> {
    const previousRange = isComparisonWanted(this.ctx)
      ? comparisonRange(this.ctx, range)
      : null;
    const [current, previous] = await Promise.all([
      this.sends.listLatencies(this.scopeOf(range)),
      previousRange
        ? this.sends.listLatencies(this.scopeOf(previousRange))
        : null,
    ]);
    return {
      ...comparedFigure(
        latencyMedian(current),
        previous ? latencyMedian(previous) : null,
      ),
      sparkline: dailyLatencies(current, range),
    };
  }

  @Get("/kpi/:metric")
  async kpi(
    @Parameter("metric", "param") metric: string,
  ): Promise<KpiCardData> {
    const range = currentRange(this.ctx);
    if (metric === LATENCY_METRIC) return this.latencyKpi(range);
    const extract = KPI_EXTRACTORS.get(metric);
    assert(extract, HTTP_NOT_FOUND, UNKNOWN_METRIC);
    const [current, previous, tracking] = await Promise.all([
      this.load(range, byDay),
      this.loadComparison(range, byDay),
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
      this.load(range, byDay),
      this.loadComparison(range, byDay),
    ]);
    return volumeChart(current, range, previous);
  }

  @Get("/top-templates")
  async topTemplates() {
    const metric =
      TOP_METRICS.get(this.ctx.url.searchParams.get("metric") ?? "") ??
      DEFAULT_TOP_METRIC;
    const range = currentRange(this.ctx);
    const [sends, previous, templates] = await Promise.all([
      this.load(range, () => BY_TEMPLATE),
      this.loadComparison(range, () => BY_TEMPLATE),
      this.namedTemplates(),
    ]);
    const before = previous ? totalsBy(previous.sends) : null;
    const items = [...tallyGroups(sends)].map(([slug, rows]) =>
      toTemplateItem(
        String(slug),
        aggregate(rows),
        templates,
        metric,
        before?.get(slug),
      ),
    );
    return { items: ranked(items, MAX_TOP_TEMPLATES) };
  }

  @Get("/domains")
  async domains() {
    const range = currentRange(this.ctx);
    const [sends, previous] = await Promise.all([
      this.load(range, () => BY_DOMAIN),
      this.loadComparison(range, () => BY_DOMAIN),
    ]);
    const before = previous ? totalsBy(previous.sends) : null;
    const items = [...tallyGroups(sends)].map(([domain, rows]) =>
      toDomainItem(String(domain), aggregate(rows), before?.get(domain)),
    );
    return { items: ranked(items, MAX_TOP_DOMAINS) };
  }

  @Get("/funnel")
  async funnel() {
    const kind = readFunnelKind(this.ctx.url.searchParams.get("kind"));
    const range = currentRange(this.ctx);
    const [sends, previous, templates, tracking] = await Promise.all([
      this.load(range, () => BY_TEMPLATE),
      this.loadComparison(range, () => BY_TEMPLATE),
      this.namedTemplates(),
      readTracking(),
    ]);
    const funnelOf = (rows: SendTally[]): FunnelStepResponse[] => {
      const kept = filterByKind(rows, templates, kind);
      return funnelSteps(aggregate(kept), isDeliveryUntracked(kept, tracking));
    };
    const steps = funnelOf(sends);
    return {
      steps: previous ? comparedSteps(steps, funnelOf(previous.sends)) : steps,
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
    const items = buildAttentionItems({
      templates,
      sends,
      excludedCount: rows.length - sends.length,
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
  current: SendTally[],
  previous: SendTally[] | null,
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
  sends: SendTally[],
  tracking: ProviderTracking | null,
): boolean {
  return DELIVERY_METRICS.has(metric) && isDeliveryUntracked(sends, tracking);
}

/**
 * The send volume chart; the comparison series overlaps the current one. A
 * suppressed send never left, so it is not counted, as in the Sends KPI.
 */
export function volumeChart(
  current: SendTally[],
  range: DateRange,
  previous: ComparedWindow | null,
) {
  const sent = current.filter(leftForProvider);
  const previousSent = previous?.sends.filter(leftForProvider) ?? null;
  const series = dailySeries(sent, range);
  const comparisonSeries =
    previous && previousSent
      ? [
          {
            name: previous.label,
            data: alignSeries(
              dailySeries(previousSent, previous.range),
              series,
            ),
          },
        ]
      : [];
  return {
    ...comparedFigure(
      countOf(sent),
      previousSent ? countOf(previousSent) : null,
    ),
    series: [{ name: "$dms_mailing.metrics.sends", data: series }],
    comparisonSeries,
  };
}

/**
 * What the provider says it can report. An unreachable provider yields `null`
 * rather than an error: the Overview keeps its other notices, and the provider
 * card is the one that reports the outage.
 */
async function readTracking(): Promise<ProviderTracking | null> {
  return trackingOf(await readCapabilities());
}

/** The totals of each group of tallies. */
export function totalsBy(sends: SendTally[]): Map<TallyKey, Totals> {
  return new Map(
    [...groupBy(sends, (send) => send.key)].map(([key, rows]) => [
      key,
      aggregate(rows),
    ]),
  );
}

/**
 * A ranked row's change against the comparison window: `null` when the row
 * had too few deliveries there to be ranked, its figure being then a guess.
 */
export function rowDelta(
  value: number,
  previous: Totals | undefined,
  metric: TopMetric,
): number | null {
  if (!previous || previous.delivered < metric.minDeliveries) return null;
  return deltaPercent(value, metric.extract(previous));
}

/** The row with its change; with none to state, the row carries no delta. */
function withDelta(item: TopListItem, delta: number | null): TopListItem {
  if (delta !== null) item.delta = delta;
  return item;
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

/** The domains are ranked on their open rate, as the templates by default. */
const DOMAIN_METRIC = DEFAULT_TOP_METRIC;

/**
 * A domain's row. `previous`, its totals over the comparison window when the
 * toolbar compares, gives the row its change.
 */
export function toDomainItem(
  domain: string,
  totals: Totals,
  previous?: Totals,
): TopListItem | null {
  const value = DOMAIN_METRIC.extract(totals);
  if (value === null || totals.delivered < DOMAIN_METRIC.minDeliveries)
    return null;
  return withDelta(
    {
      id: domain,
      title: domain,
      description: deliveredCount(totals.delivered),
      value,
    },
    rowDelta(value, previous, DOMAIN_METRIC),
  );
}

/** A template's row, its change read from `previous` as a domain's. */
export function toTemplateItem(
  slug: string,
  totals: Totals,
  templates: MailingTemplate[],
  metric: TopMetric,
  previous?: Totals,
): TopListItem | null {
  const value = metric.extract(totals);
  if (value === null || totals.delivered < metric.minDeliveries) return null;
  const template = templates.find((candidate) => candidate.slug === slug);
  return withDelta(
    {
      id: slug,
      title: template?.name ?? slug,
      description: {
        key: TEMPLATE_VOLUME_KEY,
        params: { slug, count: { type: "count", value: totals.delivered } },
      },
      value,
      to: template ? `${TEMPLATES_PATH}/${template._id}` : undefined,
    },
    rowDelta(value, previous, metric),
  );
}
