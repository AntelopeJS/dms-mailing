import {
  Context,
  Controller,
  Get,
  Parameter,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import type { TopListItem } from "@antelopejs/interface-dms/base";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { API_BASE_PATH, HTTP_NOT_FOUND } from "../constants";
import {
  type MailingSend,
  type MailingTemplate,
  SendModel,
  TemplateModel,
} from "../db";
import { OverviewPageController } from "../pages/overview";
import { readCapabilities } from "../services/provider";
import {
  buildAttentionItems,
  type ProviderTracking,
} from "../services/attention";
import {
  aggregate,
  dailySeries,
  deltaPercent,
  domainOf,
  forAudience,
  groupBy,
  ratio,
  readAudience,
  type DateRange,
  type Totals,
} from "../services/metrics";
import { SEND_AUDIENCE_QUERY_KEY, type SendAudience } from "../types";
import { comparisonRange, currentRange } from "./period";

const UNKNOWN_METRIC = "$dms_mailing.errors.unknown_metric";
const EDITOR_PATH = "/modules/mailing/editor";
const MAX_TOP_TEMPLATES = 10;
const MAX_TOP_DOMAINS = 6;
const FULL_RATE = 100;

const KPI_EXTRACTORS: Record<string, (totals: Totals) => number> = {
  sends: (totals) => totals.sends,
  deliverability: (totals) => totals.deliverability,
  "open-rate": (totals) => totals.openRate,
  "click-rate": (totals) => totals.clickRate,
  bounces: (totals) => totals.bounced,
  unsubscribes: (totals) => totals.unsubscribed,
  queued: (totals) => totals.queued,
  latency: (totals) => totals.latencyMedian,
};

const TOP_METRICS: Record<string, (totals: Totals) => number> = {
  "open-rate": (totals) => totals.openRate,
  "click-rate": (totals) => totals.clickRate,
  sends: (totals) => totals.sends,
};

const FUNNEL_STEPS: Array<[string, (totals: Totals) => number]> = [
  ["sent", (totals) => totals.sends],
  ["delivered", (totals) => totals.delivered],
  ["opened", (totals) => totals.opened],
  ["clicked", (totals) => totals.clicked],
  ["unsubscribed", (totals) => totals.unsubscribed],
];

export class MetricsController extends Controller(`${API_BASE_PATH}/metrics`) {
  @Context()
  declare ctx: RequestContext;

  @AuthUserWithPermission(OverviewPageController)
  declare user: User;

  @TenantScopedModel(SendModel)
  declare sends: SendModel;

  @TenantScopedModel(TemplateModel)
  declare templates: TemplateModel;

  /**
   * Which sends this request describes. Declared by the calling page, never
   * inferred: the Overview asks for the business view, the Sends page for the
   * operational one.
   */
  private get audience(): SendAudience {
    return readAudience(this.ctx.url.searchParams.get(SEND_AUDIENCE_QUERY_KEY));
  }

  private async load(range: DateRange): Promise<MailingSend[]> {
    const rows = await this.sends.listBetween(range.from, range.to);
    return forAudience(rows, this.audience);
  }

  @Get("/kpi/:metric")
  async kpi(@Parameter("metric", "param") metric: string) {
    const extract = KPI_EXTRACTORS[metric];
    assert(extract, HTTP_NOT_FOUND, UNKNOWN_METRIC);
    const range = currentRange(this.ctx);
    const previousRange = comparisonRange(this.ctx, range);
    const [current, previous] = await Promise.all([
      this.load(range),
      this.load(previousRange),
    ]);
    const value = extract(aggregate(current));
    const previousValue = extract(aggregate(previous));
    return {
      value,
      previousValue,
      delta: deltaPercent(value, previousValue),
      sparkline: dailySeries(current, range.from, range.to).map(
        (point) => point.y,
      ),
    };
  }

  @Get("/volume")
  async volume() {
    const range = currentRange(this.ctx);
    const previousRange = comparisonRange(this.ctx, range);
    const [current, previous] = await Promise.all([
      this.load(range),
      this.load(previousRange),
    ]);
    const totals = aggregate(current);
    const previousTotals = aggregate(previous);
    return {
      value: totals.sends,
      previousValue: previousTotals.sends,
      delta: deltaPercent(totals.sends, previousTotals.sends),
      series: [
        {
          name: "$dms_mailing.metrics.sends",
          data: dailySeries(current, range.from, range.to),
        },
      ],
      comparisonSeries: [
        {
          name: "$dms_mailing.metrics.previous",
          data: dailySeries(previous, previousRange.from, previousRange.to),
        },
      ],
    };
  }

  @Get("/top-templates")
  async topTemplates() {
    const metric = this.ctx.url.searchParams.get("metric") ?? "open-rate";
    const extract =
      TOP_METRICS[metric] ??
      (TOP_METRICS["open-rate"] as (totals: Totals) => number);
    const sends = await this.load(currentRange(this.ctx));
    const templates = await this.templates.getAll();
    const items = [...groupBy(sends, (send) => send.templateSlug)].map(
      ([slug, rows]) => toTemplateItem(slug, rows, templates, extract),
    );
    return {
      items: items
        .sort((left, right) => right.value - left.value)
        .slice(0, MAX_TOP_TEMPLATES),
    };
  }

  @Get("/domains")
  async domains() {
    const sends = await this.load(currentRange(this.ctx));
    const items = [
      ...groupBy(sends, (send) => domainOf(send.recipientEmail)),
    ].map(([domain, rows]) => ({
      id: domain,
      title: domain,
      value: aggregate(rows).openRate,
    }));
    return {
      items: items
        .sort((left, right) => right.value - left.value)
        .slice(0, MAX_TOP_DOMAINS),
    };
  }

  @Get("/funnel")
  async funnel() {
    const totals = aggregate(await this.load(currentRange(this.ctx)));
    return {
      steps: FUNNEL_STEPS.map(([id, extract]) => ({
        id,
        label: `$dms_mailing.funnel.${id}`,
        count: extract(totals),
        rate: id === "sent" ? FULL_RATE : ratio(extract(totals), totals.sends),
      })),
    };
  }

  @Get("/attention")
  async attention() {
    const range = currentRange(this.ctx);
    const [templates, rows] = await Promise.all([
      this.templates.getAll(),
      this.sends.listBetween(range.from, range.to),
    ]);
    const sends = forAudience(rows, this.audience);
    const excluded = rows.filter((row) => !sends.includes(row));
    const tracking = await readTracking();
    return {
      items: buildAttentionItems({ templates, sends, excluded, tracking }),
    };
  }
}

/**
 * What the provider says it can report. An unreachable provider yields `null`
 * rather than an error: the Overview keeps its other notices, and the provider
 * card is the one that reports the outage.
 */
async function readTracking(): Promise<ProviderTracking | null> {
  const capabilities = await readCapabilities();
  if (!capabilities) return null;
  return {
    name: capabilities.name,
    openTracking: capabilities.features.openTracking,
    clickTracking: capabilities.features.clickTracking,
  };
}

function toTemplateItem(
  slug: string,
  rows: MailingSend[],
  templates: MailingTemplate[],
  extract: (totals: Totals) => number,
): TopListItem {
  const template = templates.find((candidate) => candidate.slug === slug);
  return {
    id: slug,
    title: template?.name ?? slug,
    description: slug,
    value: extract(aggregate(rows)),
    to: template ? `${EDITOR_PATH}?id=${template._id}` : undefined,
  };
}
