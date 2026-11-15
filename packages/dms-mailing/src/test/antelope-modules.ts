/**
 * The package modules the playground and the test stack both run.
 *
 * Declared once so a version bump lands in a single place: the two configs
 * previously repeated these, and an upgrade that missed one failed the whole
 * test run with `Incompatible interface package resolution` — the harness
 * resolves its own module set, so a stale pin there is not caught by the
 * module's own `package.json`.
 *
 * Only the *source* is shared. Each config supplies its own per-module
 * `config`, since the playground talks to a real Mongo and Ethereal while the
 * tests drive a memory replica set and an SMTP fixture.
 *
 * Modules only one stack needs — the local
 * checkouts — stay in their own config.
 *
 * Each package version is exact, so a release of one of these modules changes
 * what CI tests only through a Renovate pull request (`renovate.json`).
 */
export const SHARED_MODULE_SOURCES = {
  dms: {
    type: "package",
    package: "@antelopejs/dms",
    version: "0.20.2",
  },
  mongodb: { type: "local", path: "node_modules/@antelopejs/mongodb" },
  "auth-jwt": {
    type: "package",
    package: "@antelopejs/auth-jwt",
    version: "1.1.2",
  },
  api: {
    type: "package",
    package: "@antelopejs/api",
    version: "1.7.5",
  },
  "file-storage-local": {
    type: "package",
    package: "@antelopejs/file-storage-local",
    version: "0.2.1",
  },
  nodemailer: {
    type: "package",
    package: "@antelopejs/nodemailer",
    version: "0.0.12",
  },
  "dms-automation": {
    type: "package",
    package: "@antelopejs/dms-automation",
    version: "0.11.1",
  },
} as const;
