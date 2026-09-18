import {
  Category,
  PageController,
  RegisterPage,
  settingsCategory,
} from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { MAILING_SETTINGS_MANAGE_PERMISSION, MODULE_ID } from "../../constants";
import { mailingSettingsForm } from "./form";

const SETTINGS_ORDER = 3;

export const mailingSettingsCategory = Category(MODULE_ID, {
  category: settingsCategory,
  displayName: "$dms_mailing.title",
  icon: "i-ph-envelope-simple",
  order: SETTINGS_ORDER,
  authOnly: true,
});

@RegisterPage()
export class MailingSettingsPage extends PageController(
  "settings",
  {
    displayName: "$dms_mailing.settings.title",
    description: "$dms_mailing.settings.description",
    icon: "i-ph-gear",
    category: mailingSettingsCategory,
    permission: { id: MAILING_SETTINGS_MANAGE_PERMISSION },
  },
  DefaultLayout(),
) {
  static content = mailingSettingsForm;
}
