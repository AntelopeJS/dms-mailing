import { guarded } from "../guard.mjs";
import { categoriesPage } from "./parts/settings-page-categories.mjs";
import { morePageJourneys } from "./parts/settings-page-more.mjs";
import { pageJourneys } from "./parts/settings-page.mjs";
import { categoryJourneys } from "./parts/settings-categories.mjs";
import { retention } from "./parts/settings-retention.mjs";
import { urlJourneys } from "./parts/settings-url.mjs";
import { webhookSettingsJourneys } from "./parts/settings-webhook.mjs";
import { deliveryJourneys } from "./parts/settings-delivery.mjs";
import { basicsJourneys } from "./parts/settings-basics.mjs";

export const journeys = guarded([...pageJourneys, ...morePageJourneys, categoriesPage]);

/** The HTTP journeys, which the backend suite runs in-process (`packages/dms-mailing/src/test/integration/settings.journeys.test.ts`). */
export const apiJourneys = [...basicsJourneys, ...deliveryJourneys, ...webhookSettingsJourneys, ...urlJourneys, retention, ...categoryJourneys];
