import {
  ANTELOPE_IGNORE_PATTERNS,
  antelopePreset,
} from "@antelopejs/tooling-configs/oxc/lint";
import { defineConfig } from "oxlint";

/** ESLint owns the Vue layer until oxlint lints `.vue` files. */
export default defineConfig({
  extends: [antelopePreset({ importSorting: false })],
  ignorePatterns: [
    ...ANTELOPE_IGNORE_PATTERNS,
    "packages/dms-mailing/frontend-vue/**",
  ],
  options: {
    typeAware: true,
    maxWarnings: 0,
  },
  overrides: [
    {
      files: ["packages/dms-mailing/src/test/**/*.test.ts"],
      rules: {
        "eslint/max-lines": "off",
        "eslint/max-lines-per-function": "off",
      },
    },
  ],
});
