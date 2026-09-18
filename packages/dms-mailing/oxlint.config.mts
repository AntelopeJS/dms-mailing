import { defineConfig } from "oxlint";
import { sharedLintConfig } from "../../oxlint.config.mts";

export default defineConfig({
  ...sharedLintConfig,
  // Front-end sources, which oxlint cannot lint yet: ESLint owns the layer.
  ignorePatterns: [...sharedLintConfig.ignorePatterns, "frontend-vue/**"],
  overrides: [
    {
      files: ["src/test/**/*.test.ts"],
      rules: {
        "eslint/max-lines": "off",
        "eslint/max-lines-per-function": "off",
      },
    },
  ],
});
