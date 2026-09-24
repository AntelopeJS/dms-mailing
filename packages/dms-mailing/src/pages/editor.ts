import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { MODULE_ID } from "../constants";

const EDITOR_PAGE_ORDER = 2;

@RegisterPage()
export class MailingEditorController extends PageController(
  "editor",
  {
    displayName: "$dms_mailing.editor.title",
    description: "$dms_mailing.editor.description",
    icon: "i-ph-pencil-simple",
    module: MODULE_ID,
    order: EDITOR_PAGE_ORDER,
    hidden: true,
  },
  DefaultLayout({ fullWidth: true }),
) {
  static editor = CustomComponent("DmsMailingEditor");
}
