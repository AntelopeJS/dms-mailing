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
    data: {
      globs: [`${MODULE}/src/db/models/send-events.model.ts`, `${MODULE}/src/db/models/sends.model.ts`, `${MODULE}/src/routes/suppressions.ts`, `${MODULE}/src/data/templates-table.ts`, `${MODULE}/src/crons/**`, `${MODULE}/src/services/send-import.ts`],
      funnels: [],
      containments: [],
      why: "these delete sends, send events, suppression entries, templates and their versions, and import past sends, which a revert of the code does not bring back",
    },
    format: {
      globs: [`${MODULE}/src/db/**`, `${MODULE}/src/types/**`, `${MODULE}/src/validation/**`],
      funnels: [],
      containments: [],
      why: "the tables, the stored template content and the validation schemas are read back by the next version of the module",
    },
    contract: {
      globs: [`${MODULE}/package.json`, `${MODULE}/src/routes/**`, `${MODULE}/src/data/**`, `${MODULE}/src/implementations/**`, `${MODULE}/src/config.ts`, `${INTERFACE}/package.json`, `${INTERFACE}/src/**`],
      funnels: [],
      containments: [],
      why: "other modules import the interface, the dashboard and relays call the HTTP routes and the webhook, and projects set the module option",
    },
    outbound: {
      globs: [`${MODULE}/src/services/checked-send.ts`, `${MODULE}/src/services/send.ts`, `${MODULE}/src/routes/sends.ts`, `${MODULE}/src/services/suppressions.ts`, `${MODULE}/src/services/notify.ts`],
      funnels: [`${MODULE}/src/services/checked-send.ts`],
      containments: [],
      why: "these send e-mail to real recipients through the project's provider and check the suppression list first",
    },
    exposure: {
      globs: [`${MODULE}/src/routes/events.ts`, `${MODULE}/src/permissions.ts`, `${MODULE}/src/services/permissions.ts`, `${MODULE}/src/services/settings.ts`],
      funnels: [],
      containments: [],
      why: "the webhook is a public endpoint guarded by a secret, and the permissions decide who may send or read the log",
    },
    publish: {
      globs: [`${MODULE}/package.json`, `${INTERFACE}/package.json`, `${MODULE}/.release-it.json`, `${MODULE}/changelogen.config.json`, ".github/workflows/release.yml", ".github/workflows/release-interface.yml"],
      funnels: [],
      containments: [],
      why: "the package names, their files and the release workflows claim @antelopejs/dms-mailing and @antelopejs/interface-dms-mailing in the npm registry",
    },
  },
  formal: [],
};

export default config;
