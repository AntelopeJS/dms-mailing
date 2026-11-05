import { guarded } from "../guard.mjs";
import { modeJourneys } from "./parts/send-code-modes.mjs";
import { values } from "./parts/send-code-values.mjs";
import { resultJourneys } from "./parts/send-code-results.mjs";

export const journeys = guarded([...resultJourneys, values, ...modeJourneys]);
