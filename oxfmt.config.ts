import { antelopeFmtPreset } from "@antelopejs/tooling-configs/oxc/fmt";

/** Markdown is never formatted; Prettier keeps the Vue layer; the journeys and their helpers keep the layout they had in the verify skill. */
export default antelopeFmtPreset({
  ignorePatterns: [
    "**/*.md",
    "packages/dms-mailing/frontend-vue/**",
    "packages/dms-mailing/playground/**",
    "**/*.vue",
    "e2e/journeys/**",
    "e2e/*.mjs",
  ],
});
