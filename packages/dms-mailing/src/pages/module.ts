import { Category, RegisterModule } from "@antelopejs/interface-dms/page";
import { MODULE_ID } from "../constants";
import { catalogStatus, moduleVersion } from "../services/catalog";

const MAILING_CATEGORY_ORDER = 0;
const CONFIGURE_CATEGORY_ORDER = 1;
const TRANSPARENT_SLUG = "/";

export const mailingModule = RegisterModule({
  id: MODULE_ID,
  title: "$dms_mailing.title",
  description: "$dms_mailing.description",
  icon: "i-ph-envelope-simple",
  landingPage: "overview",
  version: moduleVersion(),
  catalogCategory: "$dms_mailing.catalog_category",
  status: catalogStatus,
});

/** The module's working pages: Overview, Templates and Sends. */
export const mailingNavCategory = Category("main", {
  displayName: "$dms_mailing.nav.mailing",
  icon: "i-ph-envelope-simple",
  category: mailingModule,
  urlSlug: TRANSPARENT_SLUG,
  type: "label",
  order: MAILING_CATEGORY_ORDER,
});

/** Where the module is set up: its Settings page. */
export const mailingConfigureCategory = Category("configure", {
  displayName: "$dms_mailing.nav.configure",
  icon: "i-ph-gear-six",
  category: mailingModule,
  urlSlug: TRANSPARENT_SLUG,
  type: "label",
  order: CONFIGURE_CATEGORY_ORDER,
});
