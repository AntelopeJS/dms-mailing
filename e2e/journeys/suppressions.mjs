import { guarded } from "../guard.mjs";
import { containment } from "./parts/suppressions-contain.mjs";
import { manage } from "./parts/suppressions-manage.mjs";
import { pageJourneys, suppressedSends } from "./parts/suppressions-page.mjs";
import { reasons } from "./parts/suppressions-reasons.mjs";

export const journeys = guarded([containment, reasons, manage, ...pageJourneys, suppressedSends]);
