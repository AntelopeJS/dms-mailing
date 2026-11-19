import type { JourneysConfig } from "@antelopejs/dms/e2e";

export default {
  playground: "e2e/playground",
  prepare: [
    [
      "pnpm",
      "install",
      "--frozen-lockfile",
      "--prefer-offline",
      "--ignore-scripts",
    ],
    ["pnpm", "run", "build"],
    [
      "pnpm",
      "install",
      "--dir",
      "e2e/playground-deps",
      "--ignore-workspace",
      "--frozen-lockfile",
      "--prefer-offline",
      "--ignore-scripts",
    ],
    [
      "ln",
      "-sfn",
      "../playground-deps/node_modules",
      "e2e/playground/node_modules",
    ],
    [
      "e2e/playground-deps/node_modules/.bin/tsc",
      "-p",
      "e2e/playground/tsconfig.build.json",
    ],
  ],
  smoke: "smoke",
} satisfies JourneysConfig;
