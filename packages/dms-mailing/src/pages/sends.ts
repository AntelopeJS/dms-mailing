import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  Grid,
  GridRow,
  KpiCard,
  type KpiCardProps,
  PeriodSelector,
  type TableViewTab,
} from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { API_BASE_PATH, MODULE_ID, SENDS_PERIOD_SCOPE } from "../constants";
import { SendsTableAPI } from "../data/sends-table";
import {
  OPERATIONAL_AUDIENCE,
  PROBLEM_STATUSES,
  SEND_AUDIENCE_QUERY_KEY,
  SEND_STATUSES,
} from "../types";
import "./module";

const SENDS_ORDER = 3;
const GRID_GAP = "1rem";

const kpi = (
  id: string,
  title: string,
  icon: string,
  extra: Partial<KpiCardProps> = {},
) =>
  KpiCard({
    title,
    icon,
    fetchUrl: `${API_BASE_PATH}/metrics/kpi/${id}?${SEND_AUDIENCE_QUERY_KEY}=${OPERATIONAL_AUDIENCE}`,
    periodScope: SENDS_PERIOD_SCOPE,
    valueFormat: "compact",
    ...extra,
  });

const statusTab = (status: string): TableViewTab => ({
  id: status,
  label: `$dms_mailing.sends.status.${status}`,
  filters: [{ accessorKey: "status", value: status, mode: "is" }],
});

@RegisterPage()
export class SendsPageController extends PageController(
  "sends",
  {
    displayName: "$dms_mailing.sends.title",
    description: "$dms_mailing.sends.description",
    icon: "i-ph-paper-plane-tilt",
    module: MODULE_ID,
    order: SENDS_ORDER,
  },
  DefaultLayout({ fullWidth: true }),
) {
  static provider = CustomComponent("DmsMailingProviderChip");

  static period = PeriodSelector({
    id: SENDS_PERIOD_SCOPE,
    variant: "segmented",
    presets: ["last-24h", "last-7-days", "last-30-days"],
    defaultPreset: "last-24h",
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
        "bounces",
        kpi("bounces", "$dms_mailing.metrics.bounces", "i-ph-arrow-u-up-left", {
          invert: true,
        }),
      )
      .child(
        "queued",
        kpi("queued", "$dms_mailing.metrics.queued", "i-ph-clock", {
          showDelta: false,
        }),
      )
      .child(
        "latency",
        kpi("latency", "$dms_mailing.metrics.latency", "i-ph-timer", {
          valueFormat: "number",
          invert: true,
        }),
      ),
  );

  static table = TableView(SendsTableAPI, {
    caption: "$dms_mailing.sends.title",
    labelKey: "recipientEmail",
    rowIdKey: "_id",
    defaultSort: { field: "createdAt", desc: true },
    tabs: [
      {
        id: "problems",
        label: "$dms_mailing.sends.tabs.problems",
        icon: "i-ph-warning",
        filters: [
          {
            accessorKey: "status",
            value: PROBLEM_STATUSES.join(","),
            mode: "is",
          },
        ],
      },
      ...SEND_STATUSES.map(statusTab),
    ],
    rowActions: {
      add: false,
      edit: false,
      duplicate: false,
      delete: false,
      copyLink: false,
      details: false,
      hasSelection: false,
      custom: [
        {
          label: "$dms_mailing.templates.actions.details",
          icon: "i-ph-info",
          // A send is an append-only record: it cannot be edited, so the
          // built-in `edit`/`details` row click has nothing to open. Flagging
          // this action gives the row back its hover affordance and opens the
          // module's own drawer on double-click, which requires a DMS that
          // honours `isDefault` on a custom row action.
          isDefault: true,
          target: {
            type: "drawer",
            component: CustomComponent("DmsMailingSendDrawer"),
            title: "$dms_mailing.templates.actions.details",
          },
        },
        {
          label: "$dms_mailing.sends.drawer.replay",
          icon: "i-ph-arrow-clockwise",
          target: {
            type: "api",
            url: `${API_BASE_PATH}/sends/{_id}/replay`,
            method: "POST",
            successMessage: "$dms_mailing.sends.drawer.replayed",
            confirm: {
              title: "$dms_mailing.sends.confirm.replay_title",
              description: "$dms_mailing.sends.confirm.replay_description",
              confirmColor: "primary",
            },
          },
        },
      ],
    },
  });
}
