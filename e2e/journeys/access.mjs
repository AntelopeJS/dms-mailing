import { guarded } from "../guard.mjs";
import { exportJourney } from "./parts/access-export.mjs";
import { uiAccessJourneys } from "./parts/access-ui.mjs";
import { accessJourneys } from "./parts/access-api.mjs";

export const journeys = guarded([...uiAccessJourneys]);

/** The HTTP journeys, which the backend suite runs in-process (`packages/dms-mailing/src/test/integration/access.journeys.test.ts`). */
export const apiJourneys = [...accessJourneys, exportJourney];
