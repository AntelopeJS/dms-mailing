import { antelopeFmtPreset } from "@antelopejs/tooling-configs/oxc/fmt";

/** Markdown is never formatted; Prettier keeps the Vue layer. */
export default antelopeFmtPreset({
  ignorePatterns: [
    "**/*.md",
    "packages/dms-mailing/frontend-vue/**",
    "packages/dms-mailing/playground/**",
    "**/*.vue",
  ],
});
