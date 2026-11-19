import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import verifyConfig from "../.agents/skills/verify-dms-mailing/verify.config.ts";

const REPOSITORY_ROOT = join(import.meta.dirname, "..");
const DMS_CONTROL = join(
  dirname(
    createRequire(import.meta.url).resolve("@antelopejs/dms/package.json"),
  ),
  "bin",
  "dms-control.mjs",
);
const FORMAL_TIMEOUT_MS = 600_000;
const RUNNER_JAVA_HOME =
  process.env["JAVA_HOME_21_X64"] ?? process.env["JAVA_HOME_17_X64"];
const FORMAL_ENV =
  process.env["JAVA"] === undefined && RUNNER_JAVA_HOME !== undefined
    ? { ...process.env, JAVA: join(RUNNER_JAVA_HOME, "bin", "java") }
    : process.env;

/**
 * Runs a command from the repository root with the Node that runs the suite in place of `node`. TLC needs Java 11 or
 * later and a GitHub runner's default `java` can be Java 8, so `JAVA` names the runner's Java 21 or 17 when it is unset.
 *
 * @param {string[]} command The program and its arguments
 * @param {number} [timeout] Milliseconds before the command is killed
 * @returns {{ status: number | null, output: string }} The exit code and what it printed on both streams
 */
function run([program, ...args], timeout) {
  const result = spawnSync(
    program === "node" ? process.execPath : String(program),
    args,
    { cwd: REPOSITORY_ROOT, encoding: "utf8", env: FORMAL_ENV, timeout },
  );
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`,
  };
}

await test("the feature map covers every user-facing file, and every feature has described journeys and existing docs pages", () => {
  const { status, output } = run(["node", DMS_CONTROL, "map"]);
  assert.equal(status, 0, output);
});

for (const check of verifyConfig.formal) {
  await test(
    `the formal check ${check.name} matches its recorded findings and its covered code`,
    { timeout: FORMAL_TIMEOUT_MS },
    () => {
      const { status, output } = run(check.command, FORMAL_TIMEOUT_MS);
      const violated = check.violation
        ? Array.from(output.matchAll(check.violation), (match) => match[1])
        : [];
      assert.deepEqual(violated, [], output);
      assert.equal(status, 0, output);
    },
  );
}
