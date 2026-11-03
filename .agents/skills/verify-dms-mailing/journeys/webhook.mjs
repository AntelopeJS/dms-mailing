import { guarded } from "../guard.mjs";
import { eventJourneys } from "./parts/webhook-events.mjs";
import { notify } from "./parts/webhook-notify.mjs";
import { refusalJourneys } from "./parts/webhook-refusals.mjs";

export const journeys = guarded([...refusalJourneys, ...eventJourneys, notify]);
