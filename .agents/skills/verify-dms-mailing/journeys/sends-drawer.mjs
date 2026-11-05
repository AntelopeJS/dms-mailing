import { journeys as actions } from "./parts/sends-actions.mjs";
import { journeys as drawer } from "./parts/sends-drawer.mjs";
import { guarded } from "../guard.mjs";
import { journeys as timeline } from "./parts/sends-timeline.mjs";

/** The send drawer: its place in the log, the plain-language problem, the timeline, the origin, the data and the footer. */
export const journeys = [...drawer, ...actions, ...guarded(timeline)];
