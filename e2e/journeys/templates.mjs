import { journeys as create } from "./parts/templates-create.mjs";
import { journeys as dialog } from "./parts/templates-dialog.mjs";
import { journeys as drawer } from "./parts/templates-drawer.mjs";
import { journeys as footer } from "./parts/templates-footer.mjs";
import { journeys as table } from "./parts/templates-table.mjs";
import { apiJourneys as apiGallery, journeys as gallery } from "./parts/templates-gallery.mjs";
import { journeys as lifecycle } from "./parts/templates-lifecycle.mjs";
import { journeys as actions } from "./parts/templates-actions.mjs";
import { guarded } from "../guard.mjs";

/** The templates pages: the gallery, the new template dialog, the details drawer, the table display and the actions menu. */
export const journeys = guarded([...gallery, ...dialog, ...drawer, ...table, ...actions]);

/** Creation rules, copies, lifecycle, sends of templates out of use, deletion and the starters, which the backend suite runs in-process (`packages/dms-mailing/src/test/integration/templates.journeys.test.ts`). */
export const apiJourneys = [...create, ...lifecycle, ...footer, ...apiGallery];
