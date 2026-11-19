import { guarded } from "../guard.mjs";
import { apiJourneys as apiModeJourneys, modeJourneys } from "./parts/send-code-modes.mjs";
import { values } from "./parts/send-code-values.mjs";
import { resultJourneys } from "./parts/send-code-results.mjs";

export const journeys = guarded([...modeJourneys]);

/** The HTTP journeys, which the backend suite runs in-process (`packages/dms-mailing/src/test/integration/send-from-code.journeys.test.ts`). */
export const apiJourneys = [...resultJourneys, values, ...apiModeJourneys];
