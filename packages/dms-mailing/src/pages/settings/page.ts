import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { MODULE_ID } from "../../constants";
import { mailingConfigureCategory } from "../module";
import { mailingSettingsForm } from "./form";

const SETTINGS_ORDER = 0;

/** The module's settings, in its own sidebar under Configure. */
@RegisterPage()
export class MailingSettingsPage extends PageController(
  "settings",
  {
    displayName: "$dms_mailing.settings.title",
    description: "$dms_mailing.settings.description",
    icon: "i-ph-gear-six",
    module: MODULE_ID,
    category: mailingConfigureCategory,
    order: SETTINGS_ORDER,
  },
  DefaultLayout({ fullWidth: false }),
) {
  static content = mailingSettingsForm;
}
