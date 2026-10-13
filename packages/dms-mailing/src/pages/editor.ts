import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { MODULE_ID } from "../constants";
import { mailingNavCategory } from "./module";

const EDITOR_PAGE_ORDER = 2;

/**
 * The block editor, a record page of Templates: `templates/<id>` reads
 * Mailing › Templates › <template name> in the breadcrumb.
 */
@RegisterPage()
export class MailingEditorController extends PageController(
  "editor",
  {
    displayName: "$dms_mailing.editor.title",
    description: "$dms_mailing.editor.description",
    icon: "i-ph-pencil-simple",
    module: MODULE_ID,
    category: mailingNavCategory,
    urlSlug: "templates/:id",
    order: EDITOR_PAGE_ORDER,
    hidden: true,
  },
  DefaultLayout({ fullWidth: true, hideHeader: true, fillHeight: true }),
) {
  static editor = CustomComponent("MailingEditor").meta({
    name: "$dms_mailing.permissions.editor.name",
    description: "$dms_mailing.permissions.editor.description",
    icon: "i-ph-pencil-simple",
  });
}
