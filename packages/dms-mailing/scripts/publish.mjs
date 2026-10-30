/**
 * Publishes the package through pnpm. `npm publish` does not understand
 * pnpm's workspace specifiers (`workspace:`, `catalog:`): it ships them
 * verbatim and consumers cannot install the package. pnpm resolves them while
 * it packs, so the release publishes through pnpm. release-it's own npm
 * publish step is disabled with `npm.publish: false` in .release-it.json, and
 * this script runs from the `after:bump` hook, once the new version and the
 * changelog are written but before the release commit, tag and push. The
 * working tree is dirty at that point (version bump and changelog), which is
 * exactly what pnpm's git checks refuse, so it passes `--no-git-checks`:
 * release-it owns the git state instead.
 *
 * @packageDocumentation
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @param {unknown} value
 * @returns {value is { name: string, version: string }}
 */
function isManifest(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    Object.hasOwn(value, "name") &&
    typeof value.name === "string" &&
    "version" in value &&
    Object.hasOwn(value, "version") &&
    typeof value.version === "string"
  );
}

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
/** @type {unknown} */
const manifest = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8"),
);
if (!isManifest(manifest)) {
  throw new Error("package.json: no name and version");
}
const { name, version } = manifest;

const prerelease = version.split("-").slice(1).join("-");
const identifier = prerelease.split(".")[0];
const tag = prerelease
  ? /^[a-z][\w-]*$/i.test(identifier)
    ? identifier
    : "next"
  : "latest";

const args = ["publish", "--no-git-checks", "--tag", tag];
if (process.argv.includes("--dry-run")) {
  args.push("--dry-run");
}

console.log(`Publishing ${name}@${version} with tag ${tag}`);

const result = spawnSync("pnpm", args, { cwd: packageRoot, stdio: "inherit" });
if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
