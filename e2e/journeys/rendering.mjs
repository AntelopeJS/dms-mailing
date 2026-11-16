import { guarded } from "../guard.mjs";
import { mailJourneys } from "./parts/render-mail.mjs";

export const journeys = guarded([...mailJourneys]);
