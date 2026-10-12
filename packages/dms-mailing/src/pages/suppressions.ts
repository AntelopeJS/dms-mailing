import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import type { TableViewView } from "@antelopejs/interface-dms/base";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { ButtonVariant } from "@antelopejs/interface-dms/base/types";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { API_BASE_PATH, MODULE_ID, SENDS_PATH } from "../constants";
import { SuppressionsTableAPI } from "../data/suppressions-table";
import { SUPPRESSION_REASONS, type SuppressionReason } from "../types";
import { mailingConfigureCategory } from "./module";

const SUPPRESSIONS_ORDER = 1;
const PAGE_SIZE = 50;
const SUPPRESSIONS_URL = `${API_BASE_PATH}/suppressions`;

const key = (path: string): string => `$dms_mailing.suppressions.${path}`;

const REASON_ICONS: Record<SuppressionReason, string> = {
  hard_bounce: "i-ph-at",
  complaint: "i-ph-prohibit",
  unsubscribe: "i-ph-user-minus",
  manual: "i-ph-hand",
};

const reasonView = (reason: SuppressionReason): TableViewView => ({
  id: reason.replace("_", "-"),
  label: key(`reasons.${reason}`),
  icon: REASON_ICONS[reason],
  count: true,
  filters: [{ accessorKey: "reason", value: reason, mode: "is" }],
});

/**
 * The addresses nothing is sent to any more, in the module's Configure
 * sidebar next to Settings: a searchable list someone adds to and lifts
 * entries from, which a settings form cannot hold.
 */
@RegisterPage()
export class SuppressionsPageController extends PageController(
  "suppressions",
  {
    displayName: key("title"),
    description: key("description"),
    icon: "i-ph-prohibit",
    module: MODULE_ID,
    category: mailingConfigureCategory,
    order: SUPPRESSIONS_ORDER,
  },
  DefaultLayout({ fullWidth: true }),
) {
  /** Says when a link narrowed the list to one address, and widens it back. */
  static filter = CustomComponent("MailingSuppressionFilter").meta({
    name: "$dms_mailing.permissions.suppression_filter.name",
    description: "$dms_mailing.permissions.suppression_filter.description",
    icon: "i-ph-funnel",
  });

  static table = TableView(SuppressionsTableAPI, {
    caption: key("caption"),
    labelKey: "email",
    rowIdKey: "_id",
    defaultSort: { field: "createdAt", desc: true },
    // The send drawer links to an address's entry: ?email=<address>.
    queryParamFilters: { email: { field: "email", mode: "is" } },
    searchPlaceholder: key("search"),
    pageSize: PAGE_SIZE,
    views: {
      layout: "tabs",
      items: [
        { id: "all", label: key("views.all"), count: true },
        ...SUPPRESSION_REASONS.map(reasonView),
      ],
      defaultView: "all",
    },
    footer: { countLabel: key("footer.count") },
    emptyStates: {
      firstRun: {
        title: key("empty.title"),
        description: key("empty.description"),
        icon: "i-ph-prohibit",
      },
    },
    customButtons: [
      {
        id: "add-suppression",
        label: key("actions.add"),
        icon: "i-ph-plus",
        variant: ButtonVariant.solid,
        target: {
          type: "api",
          url: SUPPRESSIONS_URL,
          method: "POST",
          successMessage: key("actions.added"),
        },
        confirm: {
          title: key("add.title"),
          description: key("add.description"),
          icon: "i-ph-prohibit",
          confirmLabel: key("add.confirm"),
          fields: [
            {
              id: "email",
              label: key("add.email"),
              type: new DefaultDataTypes.EmailType({}),
              required: true,
            },
            {
              id: "note",
              label: key("add.note"),
              hint: key("add.note_hint"),
              type: new DefaultDataTypes.StringType({}),
            },
          ],
        },
      },
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
          label: key("actions.reactivate"),
          icon: "i-ph-arrow-counter-clockwise",
          isVisible: true,
          showLabel: true,
          target: {
            type: "api",
            url: `${SUPPRESSIONS_URL}/{_id}`,
            method: "DELETE",
            successMessage: key("actions.reactivated"),
          },
          confirm: {
            title: key("reactivate.title"),
            description: key("reactivate.description"),
            color: "warning",
            icon: "i-ph-arrow-counter-clockwise",
            confirmLabel: key("reactivate.confirm"),
          },
        },
        {
          label: key("actions.see_send"),
          icon: "i-ph-paper-plane-tilt",
          rule: { field: "sendId", notEquals: "" },
          target: { type: "page", url: `${SENDS_PATH}?record={sendId}` },
        },
      ],
    },
  });
}
