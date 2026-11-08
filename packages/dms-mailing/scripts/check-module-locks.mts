import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * The backend tests install each pinned npm module from its lock in
 * `antelope-lock/<package>@<version>/`, and record one when it is missing.
 * Every pinned version must have a committed lock, and no lock may outlive its
 * pin. Prints the violations only; exits 1 when there are any. With `--prune`
 * it deletes the locks of versions no longer pinned instead of reporting them,
 * which the Renovate pull request job runs before it commits new locks.
 * Reads the pins with the pattern of the Renovate regex manager in
 * `renovate.json`, so a pin Renovate cannot see fails here too.
 */

const PACKAGE_ROOT = join(import.meta.dirname, "..");
const LOCKS = join(PACKAGE_ROOT, "antelope-lock");
const MODULES = "src/test/antelope-modules.ts";
const PIN =
  /package:\s*"(?<name>@antelopejs\/[^"]+)",\s*version:\s*"(?<version>[^"]+)"/g;
const PRUNE = process.argv.includes("--prune");

const pinned = new Set(
  Array.from(
    readFileSync(join(PACKAGE_ROOT, MODULES), "utf8").matchAll(PIN),
    (match) => `${match.groups?.name}@${match.groups?.version}`,
  ),
);

function recorded(): string[] {
  if (!existsSync(LOCKS)) {
    return [];
  }
  return readdirSync(LOCKS).flatMap((entry) =>
    entry.startsWith("@")
      ? readdirSync(join(LOCKS, entry)).map((name) => `${entry}/${name}`)
      : [entry],
  );
}

if (pinned.size === 0) {
  process.stderr.write(`${MODULES} pins no @antelopejs package.\n`);
  process.exit(1);
}

const locks = recorded();
const problems: string[] = [];

for (const lock of locks) {
  if (pinned.has(lock)) {
    continue;
  }
  if (PRUNE) {
    rmSync(join(LOCKS, lock), { recursive: true });
  } else {
    problems.push(
      `antelope-lock/${lock} is not a version pinned in ${MODULES}: delete it.`,
    );
  }
}

for (const pin of pinned) {
  if (!locks.includes(pin)) {
    problems.push(
      `antelope-lock/${pin} is missing: run \`pnpm --dir packages/dms-mailing test:backend\` and commit the lock it records.`,
    );
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exitCode = 1;
}
