import {
  QuickAction,
  QuickActionCategory,
} from "@antelopejs/interface-dms/quick-actions";
import { MODULE_ID } from "./constants";
import { TemplatesPageController } from "./pages/templates";

const NEW_TEMPLATE_ACTION_ID = "mailing.new-template";

export const mailingQuickActionCategory = QuickActionCategory(MODULE_ID, {
  displayName: "$dms_mailing.title",
  icon: "i-ph-envelope-simple",
});

export const newTemplateQuickAction = QuickAction(NEW_TEMPLATE_ACTION_ID, {
  category: mailingQuickActionCategory,
  displayName: "$dms_mailing.templates.actions.new",
  icon: "i-ph-plus",
  target: { type: "openForm", page: TemplatesPageController },
});
