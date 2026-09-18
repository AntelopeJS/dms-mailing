import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import type { TableViewTab } from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import {
  API_BASE_PATH,
  GALLERY_DISPLAY_ID,
  MAILING_ACCESS_PERMISSION,
  MODULE_ID,
} from "../constants";
import { TemplatesTableAPI } from "../data/templates-table";
import "./module";

const TEMPLATES_ORDER = 1;
const TABLE_DISPLAY_ID = "table";
const EDITOR_URL = "/modules/mailing/editor?id={_id}";

const statusTab = (id: string, icon: string): TableViewTab => ({
  id,
  label: `$dms_mailing.templates.status.${id}`,
  icon,
  filters: [{ accessorKey: "status", value: id, mode: "is" }],
});

const statusAction = (action: string, doneKey: string, icon: string) => ({
  label: `$dms_mailing.templates.actions.${action}`,
  icon,
  target: {
    type: "api" as const,
    url: `${API_BASE_PATH}/templates/{_id}/${action}`,
    method: "POST" as const,
    successMessage: `$dms_mailing.templates.actions.${doneKey}`,
  },
});

@RegisterPage()
export class TemplatesPageController extends PageController(
  "templates",
  {
    displayName: "$dms_mailing.templates.title",
    description: "$dms_mailing.templates.description",
    icon: "i-ph-envelope-simple",
    module: MODULE_ID,
    order: TEMPLATES_ORDER,
    permission: { id: MAILING_ACCESS_PERMISSION },
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(TemplatesTableAPI, {
    caption: "$dms_mailing.templates.title",
    labelKey: "name",
    rowIdKey: "_id",
    defaultSort: { field: "updatedAt", desc: true },
    tabs: [
      statusTab("live", "i-ph-check-circle"),
      statusTab("draft", "i-ph-pencil-simple"),
      statusTab("archived", "i-ph-archive"),
    ],
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
          label: "$dms_mailing.templates.actions.details",
          icon: "i-ph-info",
          target: {
            type: "drawer",
            component: CustomComponent("DmsMailingTemplateDrawer"),
            title: "$dms_mailing.templates.actions.details",
          },
        },
        {
          label: "$dms_mailing.templates.actions.test_send",
          icon: "i-ph-paper-plane-tilt",
          target: {
            type: "modal",
            size: "md",
            component: CustomComponent("DmsMailingTestSendModal"),
            title: "$dms_mailing.editor.test_send_modal.title",
          },
        },
        {
          label: "$dms_mailing.templates.actions.send",
          icon: "i-ph-paper-plane-right",
          target: {
            type: "modal",
            size: "md",
            component: CustomComponent("DmsMailingTestSendModal").options({
              mode: "real",
            }),
            title: "$dms_mailing.templates.send_modal.title",
          },
        },
        {
          label: "$dms_mailing.templates.actions.open_editor",
          icon: "i-ph-pencil-simple",
          target: { type: "page", url: EDITOR_URL },
        },
        statusAction("publish", "published", "i-ph-check"),
        statusAction("unpublish", "unpublished", "i-ph-eye-slash"),
        {
          label: "$dms_mailing.templates.actions.archive",
          icon: "i-ph-archive",
          target: {
            type: "api",
            url: `${API_BASE_PATH}/templates/{_id}/archive`,
            method: "POST",
            successMessage: "$dms_mailing.templates.actions.archived",
            confirm: {
              title: "$dms_mailing.templates.confirm.archive_title",
              description: "$dms_mailing.templates.confirm.archive_description",
              confirmColor: "warning",
            },
          },
        },
      ],
    },
    customButtons: [
      {
        label: "$dms_mailing.templates.actions.create",
        icon: "i-ph-plus",
        permission: "add",
        target: {
          type: "modal",
          size: "md",
          component: CustomComponent("DmsMailingNewTemplateModal"),
          title: "$dms_mailing.templates.actions.create",
        },
      },
    ],
    displays: [{ id: GALLERY_DISPLAY_ID }, { id: TABLE_DISPLAY_ID }],
    defaultDisplay: GALLERY_DISPLAY_ID,
  });
}
