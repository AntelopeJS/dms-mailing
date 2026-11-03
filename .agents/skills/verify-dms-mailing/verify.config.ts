/** A kind of one-way door. */
export type DoorKind = "data" | "format" | "contract" | "outbound" | "exposure" | "publish";

/** Path rules for one door kind: globs, declared funnel modules, and the journeys, as `feature/journey`, that contain it. */
export interface DoorRule {
  globs: string[];
  funnels: string[];
  containments: string[];
  why: string;
}

/** The repo-owned layer of the verification skill, read by `dms-control`. */
export interface VerifyConfig {
  playground: string;
  prepare: string[][];
  userFacing: string[];
  notUserFacing: string[];
  smoke: string;
  smokeJourney: string;
  doors: Record<DoorKind, DoorRule | null>;
  formal: never[];
}

const SKILL = ".agents/skills/verify-dms-mailing";
const MODULE = "packages/dms-mailing";
const INTERFACE = "packages/interface-dms-mailing";

const config: VerifyConfig = {
  playground: `${SKILL}/playground`,
  prepare: [
    ["pnpm", "install", "--frozen-lockfile", "--prefer-offline", "--ignore-scripts"],
    ["pnpm", "run", "build"],
    ["npm", "install", "--no-save", "--no-package-lock", "--no-audit", "--no-fund", "--prefix", SKILL, "playwright-core@1.56.1"],
    ["pnpm", "install", "--dir", `${SKILL}/deps`, "--ignore-workspace", "--frozen-lockfile", "--prefer-offline", "--ignore-scripts"],
    ["ln", "-sfn", "../deps/node_modules", `${SKILL}/playground/node_modules`],
    [`${SKILL}/deps/node_modules/.bin/tsc`, "-p", `${SKILL}/playground/tsconfig.build.json`],
  ],
  userFacing: [`${MODULE}/src/**`, `${MODULE}/frontend-vue/**`, `${MODULE}/skills/**`, `${MODULE}/package.json`, `${INTERFACE}/src/**`, `${INTERFACE}/package.json`],
  notUserFacing: [
    `${MODULE}/src/test/**`,
    `${MODULE}/frontend-vue/tests/**`,
    `${MODULE}/frontend-vue/.*`,
    `${MODULE}/frontend-vue/eslint.config.mjs`,
    `${MODULE}/frontend-vue/vitest.config.ts`,
    `${MODULE}/frontend-vue/pnpm-lock.yaml`,
  ],
  smoke: "smoke",
  smokeJourney: "onboard, create a template from a starter, send a test, read it in Sends and in the mail sink",
  doors: {
    data: null,
    format: null,
    contract: null,
    outbound: null,
    exposure: null,
    publish: null,
  },
  formal: [],
};

export default config;
