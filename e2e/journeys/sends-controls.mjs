import { guarded } from "../guard.mjs";
import { journeys as filters } from "./parts/sends-filters.mjs";
import { journeys as hold } from "./parts/sends-hold.mjs";
import { journeys as pages } from "./parts/sends-pages.mjs";
import { journeys as period } from "./parts/sends-period.mjs";

/** The controls of the Sends page: the period, the quick filters, the live hold and the paging of the log. */
export const journeys = guarded([...period, ...filters, ...hold, ...pages]);
