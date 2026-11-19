import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";

const REPOSITORY_ROOT = join(import.meta.dirname, "..");
const FORMAL_TIMEOUT_MS = 600_000;
const RUNNER_JAVA_HOME =
  process.env["JAVA_HOME_21_X64"] ?? process.env["JAVA_HOME_17_X64"];
/**
 * TLC needs Java 11 or later and a GitHub runner's default `java` can be Java 8, so `JAVA` names the runner's Java 21
 * or 17 when it is unset.
 */
const FORMAL_ENV =
  process.env["JAVA"] === undefined && RUNNER_JAVA_HOME !== undefined
    ? { ...process.env, JAVA: join(RUNNER_JAVA_HOME, "bin", "java") }
    : process.env;

/** A rule a check prints as broken, changed or newly holding, each of which disagrees with its recorded findings. */
const VIOLATION = /^(?:BROKEN|CHANGED|HOLDS) +(\w+)/gm;

/** The TLA+ checks of the repository, by the name their skill gives them. */
const CHECKS = [
  {
    name: "webhook-events",
    script: ".agents/skills/formal-dms-mailing/check.mjs",
  },
  {
    name: "template-slugs",
    script: ".agents/skills/formal-template-slugs/check.mjs",
  },
];

for (const { name, script } of CHECKS) {
  await test(
    `the formal check ${name} matches its recorded findings and its covered code`,
    { timeout: FORMAL_TIMEOUT_MS },
    () => {
      const result = spawnSync(process.execPath, [script], {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        env: FORMAL_ENV,
        timeout: FORMAL_TIMEOUT_MS,
      });
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`;
      assert.deepEqual(
        Array.from(output.matchAll(VIOLATION), (match) => match[1]),
        [],
        output,
      );
      assert.equal(result.status, 0, output);
    },
  );
}
