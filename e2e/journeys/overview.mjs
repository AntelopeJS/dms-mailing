import { journeys as attention } from "./parts/overview-attention.mjs";
import { journeys as kpis } from "./parts/overview-kpis.mjs";
import { journeys as lists } from "./parts/overview-lists.mjs";
import { journeys as live } from "./parts/overview-live.mjs";
import { journeys as ui } from "./parts/overview-ui.mjs";

export const journeys = [...kpis, ...lists, ...attention, ...ui, ...live];
