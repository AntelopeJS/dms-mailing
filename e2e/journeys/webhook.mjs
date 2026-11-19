import { guarded } from "../guard.mjs";
import { eventJourneys } from "./parts/webhook-events.mjs";
import { notify } from "./parts/webhook-notify.mjs";
import { apiJourneys as apiRefusals, refusalJourneys } from "./parts/webhook-refusals.mjs";

/** The dashboard URL journey stays here: only a run with a dashboard has the proxy it posts through. */
export const journeys = guarded([...refusalJourneys]);

/** The HTTP journeys, which the backend suite runs in-process (`packages/dms-mailing/src/test/integration/webhook.journeys.test.ts`). */
export const apiJourneys = [...apiRefusals, ...eventJourneys, notify];
