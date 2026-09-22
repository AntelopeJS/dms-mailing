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
 * Modules only one stack needs — the playground's `dms-automation`, the local
 * checkouts — stay in their own config.
 */
export const SHARED_MODULE_SOURCES = {
  dms: {
    type: "package",
    package: "@antelopejs/dms",
    version: ">=0.0.1 <1.0.0",
  },
  mongodb: {
    type: "package",
    package: "@antelopejs/mongodb",
    version: "^1.3.0",
  },
  "auth-jwt": {
    type: "package",
    package: "@antelopejs/auth-jwt",
    version: "^1.0.3",
  },
  api: {
    type: "package",
    package: "@antelopejs/api",
    version: "^1.3.0",
  },
  "file-storage-local": {
    type: "package",
    package: "@antelopejs/file-storage-local",
    version: "^0.1.4",
  },
  nodemailer: {
    type: "package",
    package: "@antelopejs/nodemailer",
    version: "^0.0.4",
  },
} as const;
