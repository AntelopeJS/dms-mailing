import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { ButtonVariant } from "@antelopejs/interface-dms/base/types";
import type { TableViewTab } from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import {
  API_BASE_PATH,
  GALLERY_DISPLAY_ID,
  MODULE_ID,
  NEW_TEMPLATE_BUTTON_ID,
  TEMPLATES_PATH,
} from "../constants";
import { TemplatesTableAPI } from "../data/templates-table";
import { mailingNavCategory } from "./module";

const TEMPLATES_ORDER = 1;
const TABLE_DISPLAY_ID = "table";
const ARCHIVED_STATUS = "archived";

const statusTab = (id: string, icon: string): TableViewTab => ({
  id,
  label: `$dms_mailing.templates.tabs.${id}`,
  icon,
  filter: { accessorKey: "status", value: id, mode: "is" },
});

const permissionMeta = (id: string, icon: string) => ({
  name: `$dms_mailing.permissions.${id}.name`,
  description: `$dms_mailing.permissions.${id}.description`,
  icon,
});

const templateDrawer = CustomComponent("MailingTemplateDrawer").meta(
  permissionMeta("template_drawer", "i-ph-info"),
);
const testSendModal = CustomComponent("MailingTestSendModal").meta(
  permissionMeta("test_send", "i-ph-flask"),
);
const realSendModal = CustomComponent("MailingRealSendModal").meta(
  permissionMeta("real_send", "i-ph-paper-plane-right"),
);
const newTemplateModal = CustomComponent("MailingNewTemplateModal").meta(
  permissionMeta("new_template", "i-ph-plus"),
);

@RegisterPage()
export class TemplatesPageController extends PageController(
  "templates",
  {
    displayName: "$dms_mailing.templates.title",
    description: "$dms_mailing.templates.description",
    icon: "i-ph-envelope-simple",
    module: MODULE_ID,
    category: mailingNavCategory,
    order: TEMPLATES_ORDER,
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(TemplatesTableAPI, {
    caption: "$dms_mailing.templates.caption",
    labelKey: "name",
    rowIdKey: "_id",
    defaultSort: { field: "updatedAt", desc: true },
    searchPlaceholder: "$dms_mailing.templates.search",
    tabs: [
      {
        id: "all",
        label: "$dms_mailing.templates.tabs.all",
        filter: {
          accessorKey: "status",
          value: ARCHIVED_STATUS,
          mode: "is_not",
        },
        navBadge: true,
      },
      statusTab("live", "i-ph-check-circle"),
      statusTab("draft", "i-ph-pencil-simple"),
      statusTab(ARCHIVED_STATUS, "i-ph-archive"),
    ],
    quickFilters: [
      {
        field: "category",
        label: "$dms_mailing.templates.filters.category",
        icon: "i-ph-tag",
      },
    ],
    footer: {
      countLabel: "$dms_mailing.templates.footer.count",
      hint: "$dms_mailing.templates.footer.hint",
    },
    formContainer: { type: "drawer" },
    rowActions: {
      add: false,
      edit: true,
      details: false,
      duplicate: false,
      delete: true,
      copyLink: false,
      hasSelection: false,
      custom: [
        {
          label: "$dms_mailing.templates.actions.open_editor",
          icon: "i-ph-pencil-simple",
          isDefault: true,
          target: { type: "page", url: `${TEMPLATES_PATH}/{_id}` },
        },
        {
          label: "$dms_mailing.templates.actions.details",
          icon: "i-ph-info",
          deepLink: true,
          target: {
            type: "drawer",
            component: templateDrawer,
            title: "$dms_mailing.templates.actions.details",
          },
        },
        {
          label: "$dms_mailing.templates.actions.test_send",
          icon: "i-ph-flask",
          target: {
            type: "modal",
            size: "md",
            component: testSendModal,
            title: "$dms_mailing.test_send.title",
          },
        },
        {
          label: "$dms_mailing.templates.actions.real_send",
          icon: "i-ph-paper-plane-right",
          color: "error",
          rule: { field: "status", equals: "live" },
          target: {
            type: "modal",
            size: "md",
            component: realSendModal,
            title: "$dms_mailing.real_send.title",
          },
        },
        {
          label: "$dms_mailing.templates.actions.archive",
          icon: "i-ph-archive",
          rule: { field: "status", notEquals: ARCHIVED_STATUS },
          target: {
            type: "api",
            url: `${API_BASE_PATH}/templates/{_id}/archive`,
            method: "POST",
            successMessage: "$dms_mailing.templates.actions.archived",
          },
          confirm: {
            title: "$dms_mailing.templates.confirm.archive_title",
            description: "$dms_mailing.templates.confirm.archive_description",
            color: "warning",
          },
        },
        {
          label: "$dms_mailing.templates.actions.restore",
          icon: "i-ph-arrow-counter-clockwise",
          rule: { field: "status", equals: ARCHIVED_STATUS },
          target: {
            type: "api",
            url: `${API_BASE_PATH}/templates/{_id}/restore`,
            method: "POST",
            successMessage: "$dms_mailing.templates.actions.restored",
          },
        },
      ],
    },
    customButtons: [
      {
        id: NEW_TEMPLATE_BUTTON_ID,
        label: "$dms_mailing.templates.actions.create",
        icon: "i-ph-plus",
        variant: ButtonVariant.solid,
        permission: "add",
        target: {
          type: "modal",
          size: "lg",
          component: newTemplateModal,
          title: "$dms_mailing.new_template.title",
        },
      },
    ],
    displays: [
      { id: GALLERY_DISPLAY_ID, capabilities: { tabs: true, search: true } },
      { id: TABLE_DISPLAY_ID },
    ],
    defaultDisplay: GALLERY_DISPLAY_ID,
  });
}
