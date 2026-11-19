import { journeys as page } from "./parts/editor-page.mjs";
import { journeys as footer } from "./parts/editor-footer.mjs";
import { journeys as formats } from "./parts/editor-formats.mjs";
import { apiJourneys as apiBlocks, journeys as blocks } from "./parts/editor-blocks.mjs";
import { journeys as drafts } from "./parts/editor-drafts.mjs";
import { journeys as publish } from "./parts/editor-publish.mjs";
import { journeys as branding } from "./parts/editor-branding.mjs";
import { journeys as flows } from "./parts/editor-flows.mjs";
import { guarded } from "../guard.mjs";

/**
 * The editor page: its panes, the publish review, the canvas header and the flows of its dialogs, and the block
 * markup the DMS html-render chain draws, which only a run with a dashboard serves.
 */
export const journeys = guarded([...blocks, ...page, ...publish, ...branding, ...flows]);

/** Drafts, versions and revisions, preview and rendering of blocks, which the backend suite runs in-process (`packages/dms-mailing/src/test/integration/editor.journeys.test.ts`). */
export const apiJourneys = [...drafts, ...apiBlocks, ...formats, ...footer];
