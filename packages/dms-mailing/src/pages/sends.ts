import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  Banner,
  EmptyState,
  StatGroup,
  type TableViewTabFilter,
  type TableViewView,
} from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import type { Tone } from "@antelopejs/interface-dms/base/types";
import { GetModel } from "@antelopejs/interface-database-decorators";
import type { NavBadgeCount } from "@antelopejs/interface-dms";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import {
  API_BASE_PATH,
  MAILING_SENDS_TOPIC,
  MODULE_ID,
  SENDS_PERIOD_SCOPE,
} from "../constants";
import { SendModel } from "../db";
import { SendsTableAPI } from "../data/sends-table";
import { RESOLVED_STAGE, type SendStage } from "../types";
import { mailingNavCategory } from "./module";

const SENDS_ORDER = 3;
const DAY_MS = 86_400_000;
const STAT_COLUMNS = 5;
const TEMPLATES_PAGE = "/modules/mailing/templates";
const SUPPRESSIONS_PAGE = "/modules/mailing/suppressions";
/** About twice the default side panel: the send's JSON reads without wrapping. */
const SEND_PANEL_SIZE = "xl";
const FIRST_SEND_SNIPPET = [
  'await SendTemplate("order-confirmed", {',
  '  to: "margaux@northwind.co",',
  "  variables: { order },",
  "});",
].join("\n");

interface StageView {
  stage: SendStage;
  id: string;
  icon: string;
  tone?: Tone;
  /** Narrows the tab further than its stage. */
  filters?: TableViewTabFilter[];
}

/** The Problems tab counts like the nav badge: test sends are left out. */
const REAL_SENDS_ONLY: TableViewTabFilter = {
  accessorKey: "isTest",
  value: "false",
  mode: "is",
};

const STAGE_VIEWS: StageView[] = [
  {
    stage: "problem",
    id: "problems",
    icon: "i-ph-warning",
    tone: "error",
    filters: [REAL_SENDS_ONLY],
  },
  { stage: "in_progress", id: "in-progress", icon: "i-ph-clock" },
  { stage: "delivered", id: "delivered", icon: "i-ph-check-circle" },
  { stage: "engaged", id: "engaged", icon: "i-ph-cursor-click" },
  { stage: "unsubscribed", id: "unsubscribed", icon: "i-ph-user-minus" },
  { stage: "suppressed", id: "suppressed", icon: "i-ph-prohibit" },
];

const stageView = (view: StageView): TableViewView => ({
  id: view.id,
  label: `$dms_mailing.sends.views.${view.stage}`,
  icon: view.icon,
  tone: view.tone,
  count: true,
  filters: [
    { accessorKey: "stage", value: view.stage, mode: "is" },
    ...(view.filters ?? []),
  ],
});

type SendsTableOptions = NonNullable<
  Parameters<typeof TableView<typeof SendsTableAPI>>[1]
>;
type SendRowAction = NonNullable<
  NonNullable<SendsTableOptions["rowActions"]>["custom"]
>[number];
type SendRowRule = NonNullable<SendRowAction["rule"]>;

/** A provider failure, or a bounce the receiving server called temporary. */
const REPLAYABLE_PROBLEM: SendRowRule = {
  or: [
    { field: "status", equals: "failed" },
    {
      and: [
        { field: "status", equals: "bounced" },
        { field: "isSoftBounce", equals: true },
      ],
    },
  ],
};

/** A problem nobody dealt with yet that a send again may fix. */
const OPEN_REPLAYABLE_PROBLEM: SendRowRule = {
  and: [REPLAYABLE_PROBLEM, { field: "stage", notEquals: RESOLVED_STAGE }],
};

/**
 * "Send again…" on a problem nobody dealt with yet, unless the suppression
 * list would stop it. A test sent again stays a test, and its confirmation
 * says so.
 */
const sendAgainAction = (isTest: boolean): SendRowAction => ({
  label: "$dms_mailing.sends.actions.send_again",
  icon: "i-ph-arrow-clockwise",
  rule: {
    and: [
      OPEN_REPLAYABLE_PROBLEM,
      { field: "isRecipientSuppressed", notEquals: true },
      { field: "isTest", equals: isTest },
    ],
  },
  target: {
    type: "api",
    url: `${API_BASE_PATH}/sends/{{row._id}}/replay`,
    method: "POST",
    successMessage: "$dms_mailing.sends.actions.sent_again",
  },
  confirm: {
    title: "$dms_mailing.sends.confirm.replay_title",
    description: isTest
      ? "$dms_mailing.sends.confirm.replay_description_test"
      : "$dms_mailing.sends.confirm.replay_description",
    color: "warning",
    icon: "i-ph-arrow-clockwise",
    confirmLabel: "$dms_mailing.sends.confirm.replay_confirm",
  },
});

/**
 * In place of "Send again…" when the recipient is on the suppression list:
 * nothing would leave, the way out is the list, narrowed to the address.
 */
const suppressedAddressAction: SendRowAction = {
  label: "$dms_mailing.sends.actions.suppressed_address",
  icon: "i-ph-prohibit",
  rule: {
    and: [
      OPEN_REPLAYABLE_PROBLEM,
      { field: "isRecipientSuppressed", equals: true },
    ],
  },
  target: {
    type: "page",
    url: `${SUPPRESSIONS_PAGE}?email={{row.suppressionAddress}}`,
  },
};

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

  static health = Banner({
    fetchUrl: `${API_BASE_PATH}/sends/banner`,
    realtimeTopic: MAILING_SENDS_TOPIC,
  });

  /** The period drives this strip only: the log keeps every send. */
  static stats = StatGroup({
    layout: "joined",
    columns: STAT_COLUMNS,
    skeletonCount: STAT_COLUMNS,
    label: "$dms_mailing.sends.stats.label",
    fetchUrl: `${API_BASE_PATH}/sends/stats`,
    periodScope: SENDS_PERIOD_SCOPE,
    realtimeTopic: MAILING_SENDS_TOPIC,
  });

  static table = TableView(SendsTableAPI, {
    caption: "$dms_mailing.sends.caption",
    labelKey: "recipientEmail",
    rowIdKey: "_id",
    defaultSort: { field: "createdAt", desc: true },
    /** A template's drawer links to its sends: `?template=<slug>`. */
    queryParamFilters: { template: { field: "templateSlug", mode: "is" } },
    searchPlaceholder: "$dms_mailing.sends.search",
    pageSize: 50,
    rowClick: "single",
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
    footer: {
      countLabel: "$dms_mailing.sends.footer.count",
      hint: "$dms_mailing.sends.stats.period_hint",
    },
    emptyStates: {
      firstRun: {
        title: "$dms_mailing.sends.empty.title",
        description: "$dms_mailing.sends.empty.description",
        icon: "i-ph-paper-plane-tilt",
        component: EmptyState({
          title: "$dms_mailing.sends.empty_log.title",
          description: "$dms_mailing.sends.empty_log.description",
          icon: "i-ph-paper-plane-tilt",
          size: "lg",
          hatched: true,
          card: false,
          code: { content: FIRST_SEND_SNIPPET, language: "typescript" },
          actions: [
            {
              label: "$dms_mailing.sends.empty_log.test_instead",
              to: TEMPLATES_PAGE,
              icon: "i-ph-flask",
              variant: "outline",
              color: "neutral",
            },
          ],
        }),
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
          /**
           * A send is an append-only record: it cannot be edited, so the
           * built-in `edit`/`details` row click has nothing to open. This
           * action takes the row click and opens the send in the side panel.
           */
          isDefault: true,
          target: {
            type: "sidePanel",
            /**
             * Over the log rather than beside it: the table keeps its width
             * while a send is read, and the wider panel gives the data sent
             * and the timeline room. Row navigation, the counter, the deep
             * link and the live-table hold work the same in this mode.
             */
            overlay: true,
            size: SEND_PANEL_SIZE,
            component: CustomComponent("MailingSendDrawer").meta(
              permissionMeta("send_drawer", "i-ph-info"),
            ),
            title: "$dms_mailing.sends.actions.details",
            positionLabel: "$dms_mailing.sends.drawer.position",
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
        sendAgainAction(false),
        sendAgainAction(true),
        suppressedAddressAction,
      ],
    },
  }).navBadge({ count: (ctx) => recentProblems(ctx) });
}
