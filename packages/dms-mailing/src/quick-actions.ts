import {
  QuickAction,
  QuickActionCategory,
} from "@antelopejs/interface-dms/quick-actions";
import {
  MODULE_ID,
  NEW_TEMPLATE_ACTION_ID,
  NEW_TEMPLATE_BUTTON_ID,
} from "./constants";
import { TemplatesPageController } from "./pages/templates";

export const mailingQuickActionCategory = QuickActionCategory(MODULE_ID, {
  displayName: "$dms_mailing.title",
  icon: "i-ph-envelope-simple",
});

/** Presses the templates table's "New template" button, wherever it is called. */
export const newTemplateQuickAction = QuickAction(NEW_TEMPLATE_ACTION_ID, {
  category: mailingQuickActionCategory,
  displayName: "$dms_mailing.templates.actions.create",
  icon: "i-ph-plus",
  target: {
    type: "button",
    page: TemplatesPageController,
    button: NEW_TEMPLATE_BUTTON_ID,
  },
});
