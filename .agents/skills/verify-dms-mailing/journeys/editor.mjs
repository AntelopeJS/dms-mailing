import { journeys as page } from "./parts/editor-page.mjs";
import { journeys as footer } from "./parts/editor-footer.mjs";
import { journeys as formats } from "./parts/editor-formats.mjs";
import { journeys as blocks } from "./parts/editor-blocks.mjs";
import { journeys as drafts } from "./parts/editor-drafts.mjs";
import { guarded } from "../guard.mjs";

/** The editor: drafts, versions and revisions, preview and rendering of blocks. */
export const journeys = guarded([...drafts, ...blocks, ...formats, ...footer, ...page]);
