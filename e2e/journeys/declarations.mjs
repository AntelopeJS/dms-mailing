import { guarded } from "../guard.mjs";
import { apiJourneys as apiFields, journeys as fields } from "./parts/declare-fields.mjs";
import { localizedJourney } from "./parts/declare-localized.mjs";
import { hookJourney } from "./parts/declare-hook.mjs";
import { settingsDeclarations } from "./parts/declare-settings.mjs";
import { importJourneys } from "./parts/declare-import.mjs";
import { templateJourneys } from "./parts/declare-template.mjs";

/** The hook journey stays here: it needs a fresh DMS start on a new database, which provisions the default tenant once. */
export const journeys = guarded([hookJourney, ...fields]);

/** The HTTP journeys, which the backend suite runs in-process (`packages/dms-mailing/src/test/integration/declarations.journeys.test.ts`). */
export const apiJourneys = [...templateJourneys, ...importJourneys, ...settingsDeclarations, localizedJourney, ...apiFields];
