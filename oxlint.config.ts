import {
  ANTELOPE_IGNORE_PATTERNS,
  antelopePreset,
} from "@antelopejs/tooling-configs/oxc/lint";
import { defineConfig } from "oxlint";

/** ESLint owns the Vue layer until oxlint lints `.vue` files; the playgrounds build against dependencies only their own install brings. */
export default defineConfig({
  extends: [antelopePreset({ importSorting: false })],
  ignorePatterns: [
    ...ANTELOPE_IGNORE_PATTERNS,
    "packages/dms-mailing/frontend-vue/**",
    "packages/dms-mailing/playground/**",
    ".agents/skills/verify-dms-mailing/playground/**",
    ".claude/skills/verify-dms-mailing/playground/**",
  ],
  options: {
    typeAware: true,
    maxWarnings: 0,
  },
});
