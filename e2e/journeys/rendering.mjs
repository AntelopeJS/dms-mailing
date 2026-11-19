import { guarded } from "../guard.mjs";
import { apiJourneys as mailApiJourneys, mailJourneys } from "./parts/render-mail.mjs";

/** The journeys that read what the DMS html-render chain draws stay here: the chain is the dashboard's render endpoint, which only a run with a dashboard serves. */
export const journeys = guarded([...mailJourneys]);

/** The HTTP journeys, which the backend suite runs in-process (`packages/dms-mailing/src/test/integration/rendering.journeys.test.ts`). */
export const apiJourneys = [...mailApiJourneys];
