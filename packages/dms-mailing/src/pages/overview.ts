import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  ChartArea,
  ChartCard,
  Grid,
  GridRow,
  KpiCard,
  type KpiCardProps,
  Section,
  TopListCard,
  VStack,
} from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { ButtonVariant } from "@antelopejs/interface-dms/base/types";
import {
  API_BASE_PATH,
  MAILING_SENDS_TOPIC,
  MODULE_ID,
  NEW_TEMPLATE_ACTION_ID,
  OVERVIEW_PERIOD_SCOPE,
} from "../constants";
import { BUSINESS_AUDIENCE, SEND_AUDIENCE_QUERY_KEY } from "../types";
import { mailingNavCategory } from "./module";

const OVERVIEW_ORDER = 0;
const GRID_GAP = "1rem";
const CHART_HEIGHT = "260px";
const WIDE_SPAN = 2;

const kpi = (
  id: string,
  icon: string,
  extra: Partial<KpiCardProps> = {},
): KpiCardProps => ({
  title: `$dms_mailing.metrics.${id.replace("-", "_")}`,
  icon,
  variant: "stat",
  fetchUrl: `${API_BASE_PATH}/metrics/kpi/${id}?${SEND_AUDIENCE_QUERY_KEY}=${BUSINESS_AUDIENCE}`,
  periodScope: OVERVIEW_PERIOD_SCOPE,
  valueFormat: "compact",
  showSparkline: true,
  ...extra,
});

/** A group of two KPIs under a heading that says how to read them. */
const kpiGroup = (id: string, left: KpiCardProps, right: KpiCardProps) =>
  VStack({ alignment: "stretch" }).child(
    "group",
    Section({
      title: `$dms_mailing.overview.groups.${id}.title`,
      description: `$dms_mailing.overview.groups.${id}.description`,
      card: false,
    }).child(
      "row",
      GridRow().child("first", KpiCard(left)).child("second", KpiCard(right)),
    ),
  );

const percent: Partial<KpiCardProps> = { valueFormat: "percent" };
const inverted: Partial<KpiCardProps> = { invert: true };

const kpis = Grid({ gap: GRID_GAP }).child(
  "row",
  GridRow()
    .child(
      "reach",
      kpiGroup(
        "reach",
        kpi("sends", "i-ph-paper-plane-tilt"),
        kpi("deliverability", "i-ph-check-circle", percent),
      ),
    )
    .child(
      "engagement",
      kpiGroup(
        "engagement",
        kpi("open-rate", "i-ph-envelope-open", percent),
        kpi("click-rate", "i-ph-cursor-click", percent),
      ),
    )
    .child(
      "health",
      kpiGroup(
        "health",
        kpi("bounces", "i-ph-arrow-u-up-left", inverted),
        kpi("unsubscribes", "i-ph-user-minus", inverted),
      ),
    ),
);

const activity = Grid({ gap: GRID_GAP }).child(
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
          comparisonStyle: "dashed",
          realtimeTopic: MAILING_SENDS_TOPIC,
        }),
      }),
      { colSpan: WIDE_SPAN },
    )
    .child(
      "attention",
      CustomComponent("MailingAttentionCard").meta({
        name: "$dms_mailing.permissions.attention.name",
        description: "$dms_mailing.permissions.attention.description",
        icon: "i-ph-warning-circle",
      }),
    ),
);

const breakdown = Grid({ gap: GRID_GAP }).child(
  "row",
  GridRow()
    .child(
      "funnel",
      CustomComponent("MailingFunnelCard").meta({
        name: "$dms_mailing.permissions.funnel.name",
        description: "$dms_mailing.permissions.funnel.description",
        icon: "i-ph-funnel",
      }),
    )
    .child(
      "ranking",
      TopListCard({
        title: "$dms_mailing.metrics.ranking",
        fetchUrl: `${API_BASE_PATH}/metrics/top-templates?metric=open-rate`,
        periodScope: OVERVIEW_PERIOD_SCOPE,
        valueFormat: "percent",
        showRank: true,
        highlightTopN: 2,
        showBar: true,
        showDelta: false,
        skeletonCount: 5,
      }),
    )
    .child(
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
        showDelta: false,
        skeletonCount: 5,
      }),
    ),
);

@RegisterPage()
export class OverviewPageController extends PageController(
  "overview",
  {
    displayName: "$dms_mailing.overview.title",
    description: "$dms_mailing.overview.description",
    icon: "i-ph-chart-pie-slice",
    module: MODULE_ID,
    category: mailingNavCategory,
    order: OVERVIEW_ORDER,
  },
  DefaultLayout({
    fullWidth: true,
    headerActions: [
      {
        id: "new-template",
        label: "$dms_mailing.templates.actions.create",
        icon: "i-ph-plus",
        variant: ButtonVariant.solid,
        target: { type: "quickAction", id: NEW_TEMPLATE_ACTION_ID },
      },
    ],
  }),
) {
  static header = CustomComponent("MailingPageHeader")
    .options({
      periodScope: OVERVIEW_PERIOD_SCOPE,
      presets: ["last-7-days", "last-30-days", "last-90-days"],
      defaultPreset: "last-30-days",
      defaultComparison: "previous-period",
      showProvider: true,
    })
    .meta({
      name: "$dms_mailing.permissions.page_header.name",
      description: "$dms_mailing.permissions.page_header.description",
      icon: "i-ph-plugs-connected",
    });

  static dashboard = CustomComponent("MailingOverviewGate")
    .meta({
      name: "$dms_mailing.permissions.overview_gate.name",
      description: "$dms_mailing.permissions.overview_gate.description",
      icon: "i-ph-squares-four",
    })
    .child("kpis", kpis)
    .child("activity", activity)
    .child("breakdown", breakdown);
}
