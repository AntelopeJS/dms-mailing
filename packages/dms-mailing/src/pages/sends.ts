import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import type { TableViewView } from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import type { Tone } from "@antelopejs/interface-dms/base/types";
import { GetModel } from "@antelopejs/interface-database-decorators";
import type { NavBadgeCount } from "@antelopejs/interface-dms";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { API_BASE_PATH, MODULE_ID, SENDS_PERIOD_SCOPE } from "../constants";
import { SendModel } from "../db";
import { SendsTableAPI } from "../data/sends-table";
import type { SendStage } from "../types";
import { mailingNavCategory } from "./module";

const SENDS_ORDER = 3;
const DAY_MS = 86_400_000;

interface StageView {
  stage: SendStage;
  id: string;
  icon: string;
  tone?: Tone;
}

const STAGE_VIEWS: StageView[] = [
  { stage: "problem", id: "problems", icon: "i-ph-warning", tone: "error" },
  { stage: "in_progress", id: "in-progress", icon: "i-ph-clock" },
  { stage: "delivered", id: "delivered", icon: "i-ph-check-circle" },
  { stage: "engaged", id: "engaged", icon: "i-ph-cursor-click" },
];

const stageView = (view: StageView): TableViewView => ({
  id: view.id,
  label: `$dms_mailing.sends.views.${view.stage}`,
  icon: view.icon,
  tone: view.tone,
  count: true,
  filters: [{ accessorKey: "stage", value: view.stage, mode: "is" }],
});

const permissionMeta = (id: string, icon: string) => ({
  name: `$dms_mailing.permissions.${id}.name`,
  description: `$dms_mailing.permissions.${id}.description`,
  icon,
});

/** Problems of the last 24 hours, the red count next to "Sends" in the nav. */
async function recentProblems(
  ctx: Parameters<typeof getRequestTenantId>[0],
): Promise<NavBadgeCount> {
  const since = new Date(Date.now() - DAY_MS);
  const sends = await GetModel(SendModel, getRequestTenantId(ctx)).listBetween(
    since,
    new Date(),
  );
  const count = sends.filter(
    (send) => send.stage === "problem" && !send.isTest,
  ).length;
  return { count, tone: "error" };
}

@RegisterPage()
export class SendsPageController extends PageController(
  "sends",
  {
    displayName: "$dms_mailing.sends.title",
    description: "$dms_mailing.sends.description",
    icon: "i-ph-paper-plane-tilt",
    module: MODULE_ID,
    category: mailingNavCategory,
    order: SENDS_ORDER,
  },
  DefaultLayout({ fullWidth: true }),
) {
  static header = CustomComponent("MailingPageHeader")
    .options({
      periodScope: SENDS_PERIOD_SCOPE,
      presets: ["last-24h", "last-7-days", "last-30-days"],
      defaultPreset: "last-24h",
      defaultComparison: "previous-period",
      showProvider: true,
    })
    .meta(permissionMeta("page_header", "i-ph-plugs-connected"));

  static health = CustomComponent("MailingProviderBanner").meta(
    permissionMeta("provider_banner", "i-ph-plugs"),
  );

  static stats = CustomComponent("MailingSendsStats")
    .options({ periodScope: SENDS_PERIOD_SCOPE })
    .meta(permissionMeta("sends_stats", "i-ph-chart-bar"));

  static table = TableView(SendsTableAPI, {
    caption: "$dms_mailing.sends.caption",
    labelKey: "recipientEmail",
    rowIdKey: "_id",
    defaultSort: { field: "createdAt", desc: true },
    searchPlaceholder: "$dms_mailing.sends.search",
    pageSize: 50,
    views: {
      layout: "tabs",
      items: [
        {
          id: "all",
          label: "$dms_mailing.sends.views.all",
          count: true,
        },
        ...STAGE_VIEWS.map(stageView),
      ],
      defaultView: "all",
    },
    quickFilters: [
      {
        field: "isTest",
        label: "$dms_mailing.sends.filters.tests",
        icon: "i-ph-flask",
      },
      {
        field: "templateSlug",
        label: "$dms_mailing.sends.filters.template",
        icon: "i-ph-envelope-simple",
      },
    ],
    footer: { countLabel: "$dms_mailing.sends.footer.count" },
    emptyStates: {
      firstRun: {
        title: "$dms_mailing.sends.empty.title",
        description: "$dms_mailing.sends.empty.description",
        icon: "i-ph-paper-plane-tilt",
        component: CustomComponent("MailingSendsEmpty").meta(
          permissionMeta("sends_empty", "i-ph-paper-plane-tilt"),
        ),
      },
    },
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
          label: "$dms_mailing.sends.actions.details",
          icon: "i-ph-info",
          // A send is an append-only record: it cannot be edited, so the
          // built-in `edit`/`details` row click has nothing to open. This
          // action takes the row click and opens the module's own drawer.
          isDefault: true,
          deepLink: true,
          target: {
            type: "drawer",
            component: CustomComponent("MailingSendDrawer").meta(
              permissionMeta("send_drawer", "i-ph-info"),
            ),
            title: "$dms_mailing.sends.actions.details",
          },
        },
        {
          label: "$dms_mailing.sends.actions.rendering",
          icon: "i-ph-eye",
          target: {
            type: "modal",
            size: "3xl",
            component: CustomComponent("MailingRenderingModal").meta(
              permissionMeta("rendering", "i-ph-eye"),
            ),
            title: "$dms_mailing.rendering.title",
          },
        },
        {
          label: "$dms_mailing.sends.actions.send_again",
          icon: "i-ph-arrow-clockwise",
          rule: { field: "status", equals: "failed" },
          target: {
            type: "api",
            url: `${API_BASE_PATH}/sends/{_id}/replay`,
            method: "POST",
            successMessage: "$dms_mailing.sends.actions.sent_again",
          },
          confirm: {
            title: "$dms_mailing.sends.confirm.replay_title",
            description: "$dms_mailing.sends.confirm.replay_description",
            color: "warning",
            icon: "i-ph-arrow-clockwise",
            confirmLabel: "$dms_mailing.sends.confirm.replay_confirm",
          },
        },
      ],
    },
  }).navBadge({ count: (ctx) => recentProblems(ctx) });
}
