import { guarded } from "../guard.mjs";
import { exportJourney } from "./parts/access-export.mjs";
import { uiAccessJourneys } from "./parts/access-ui.mjs";
import { accessJourneys } from "./parts/access-api.mjs";

export const journeys = guarded([...accessJourneys, ...uiAccessJourneys, exportJourney]);
