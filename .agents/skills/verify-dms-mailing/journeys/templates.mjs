import { journeys as create } from "./parts/templates-create.mjs";
import { journeys as dialog } from "./parts/templates-dialog.mjs";
import { journeys as drawer } from "./parts/templates-drawer.mjs";
import { journeys as table } from "./parts/templates-table.mjs";
import { journeys as gallery } from "./parts/templates-gallery.mjs";
import { journeys as lifecycle } from "./parts/templates-lifecycle.mjs";
import { guarded } from "../guard.mjs";

/** The templates: creation rules, copies, lifecycle, sends of templates out of use and deletion. */
export const journeys = guarded([...create, ...lifecycle, ...gallery, ...dialog, ...drawer, ...table]);
