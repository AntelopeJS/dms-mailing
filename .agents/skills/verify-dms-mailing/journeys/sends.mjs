import { journeys as access } from "./parts/sends-access.mjs";
import { journeys as actions } from "./parts/sends-actions.mjs";
import { journeys as banner } from "./parts/sends-banner.mjs";
import { journeys as drawer } from "./parts/sends-drawer.mjs";
import { journeys as log } from "./parts/sends-log.mjs";
import { journeys as replay } from "./parts/sends-replay.mjs";

export const journeys = [...log, ...drawer, ...replay, ...banner, ...actions, ...access];
