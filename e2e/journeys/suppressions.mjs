import { guarded } from "../guard.mjs";
import { containment } from "./parts/suppressions-contain.mjs";
import { manage } from "./parts/suppressions-manage.mjs";
import { pageJourneys, suppressedSends } from "./parts/suppressions-page.mjs";
import { reasons } from "./parts/suppressions-reasons.mjs";

export const journeys = guarded([...pageJourneys, suppressedSends]);

/** The HTTP journeys, which the backend suite runs in-process (`packages/dms-mailing/src/test/integration/suppressions.journeys.test.ts`). */
export const apiJourneys = [containment, reasons, manage];
