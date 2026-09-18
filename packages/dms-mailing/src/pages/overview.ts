import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  ChartArea,
  ChartCard,
  Grid,
  GridRow,
  KpiCard,
  type KpiCardProps,
  PeriodSelector,
  TopListCard,
} from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  API_BASE_PATH,
  MAILING_ACCESS_PERMISSION,
  MAILING_SENDS_TOPIC,
  MODULE_ID,
  OVERVIEW_PERIOD_SCOPE,
} from "../constants";
import { BUSINESS_AUDIENCE, SEND_AUDIENCE_QUERY_KEY } from "../types";
import "./module";

const OVERVIEW_ORDER = 0;
const GRID_GAP = "1rem";
const CHART_HEIGHT = "260px";

const kpi = (
  id: string,
  title: string,
  icon: string,
  extra: Partial<KpiCardProps> = {},
) =>
  KpiCard({
    title,
    icon,
    fetchUrl: `${API_BASE_PATH}/metrics/kpi/${id}?${SEND_AUDIENCE_QUERY_KEY}=${BUSINESS_AUDIENCE}`,
    periodScope: OVERVIEW_PERIOD_SCOPE,
    valueFormat: "compact",
    showSparkline: true,
    ...extra,
  });

@RegisterPage()
export class OverviewPageController extends PageController(
  "overview",
  {
    displayName: "$dms_mailing.overview.title",
    description: "$dms_mailing.overview.description",
    icon: "i-ph-chart-pie-slice",
    module: MODULE_ID,
    order: OVERVIEW_ORDER,
    permission: { id: MAILING_ACCESS_PERMISSION },
  },
  DefaultLayout({ fullWidth: true }),
) {
  static period = PeriodSelector({
    id: OVERVIEW_PERIOD_SCOPE,
    variant: "segmented",
    presets: ["last-7-days", "last-30-days", "last-90-days"],
    defaultPreset: "last-30-days",
    defaultComparison: "previous-period",
    align: "right",
  });

  static kpis = Grid({ gap: GRID_GAP }).child(
    "row",
    GridRow()
      .child(
        "sends",
        kpi("sends", "$dms_mailing.metrics.sends", "i-ph-paper-plane-tilt"),
      )
      .child(
        "deliverability",
        kpi(
          "deliverability",
          "$dms_mailing.metrics.deliverability",
          "i-ph-check-circle",
          { valueFormat: "percent" },
        ),
      )
      .child(
        "open-rate",
        kpi(
          "open-rate",
          "$dms_mailing.metrics.open_rate",
          "i-ph-envelope-open",
          { valueFormat: "percent" },
        ),
      )
      .child(
        "click-rate",
        kpi(
          "click-rate",
          "$dms_mailing.metrics.click_rate",
          "i-ph-cursor-click",
          { valueFormat: "percent" },
        ),
      )
      .child(
        "bounces",
        kpi("bounces", "$dms_mailing.metrics.bounces", "i-ph-arrow-u-up-left", {
          invert: true,
        }),
      )
      .child(
        "unsubscribes",
        kpi(
          "unsubscribes",
          "$dms_mailing.metrics.unsubscribes",
          "i-ph-user-minus",
          { invert: true },
        ),
      ),
  );

  static row2 = Grid({ gap: GRID_GAP }).child(
    "row",
    GridRow()
      .child(
        "volume",
        ChartCard({
          title: "$dms_mailing.metrics.volume",
          // The legend is the one series label the DMS translates: it runs
          // `primaryLabel`/`comparisonLabel` through `processI18n`, while the
          // `name` carried by each series goes to ApexCharts verbatim.
          primaryLabel: "$dms_mailing.metrics.sends",
          comparisonLabel: "$dms_mailing.metrics.previous",
          fetchUrl: `${API_BASE_PATH}/metrics/volume`,
          periodScope: OVERVIEW_PERIOD_SCOPE,
          chart: ChartArea({
            height: CHART_HEIGHT,
            xaxisType: "datetime",
            smooth: true,
            showGrid: true,
            realtimeTopic: MAILING_SENDS_TOPIC,
          }),
        }),
      )
      .child("attention", CustomComponent("DmsMailingAttentionCard")),
  );

  static row3 = Grid({ gap: GRID_GAP }).child(
    "row",
    GridRow()
      .child(
        "ranking",
        TopListCard({
          title: "$dms_mailing.metrics.ranking",
          fetchUrl: `${API_BASE_PATH}/metrics/top-templates?metric=open-rate`,
          periodScope: OVERVIEW_PERIOD_SCOPE,
          valueFormat: "percent",
          showRank: true,
        }),
      )
      .child("funnel", CustomComponent("DmsMailingFunnelCard")),
  );

  static row4 = Grid({ gap: GRID_GAP }).child(
    "row",
    GridRow().child(
      "domains",
      TopListCard({
        title: "$dms_mailing.metrics.domains",
        // On the card, not on each row: `TopListRow` renders `item.description`
        // verbatim, so a `$` key would show up raw.
        description: "$dms_mailing.metrics.domain_sends",
        fetchUrl: `${API_BASE_PATH}/metrics/domains`,
        periodScope: OVERVIEW_PERIOD_SCOPE,
        valueFormat: "percent",
        showRank: false,
      }),
    ),
  );
}
