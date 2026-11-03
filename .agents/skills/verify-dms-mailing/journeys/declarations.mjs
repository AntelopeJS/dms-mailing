import { guarded } from "../guard.mjs";
import { localizedJourney } from "./parts/declare-localized.mjs";
import { hookJourney } from "./parts/declare-hook.mjs";
import { settingsDeclarations } from "./parts/declare-settings.mjs";
import { importJourneys } from "./parts/declare-import.mjs";
import { templateJourneys } from "./parts/declare-template.mjs";

export const journeys = guarded([...templateJourneys, ...importJourneys, ...settingsDeclarations, hookJourney, localizedJourney]);
