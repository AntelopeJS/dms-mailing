import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import suite from "../e2e/journeys.config.ts";

const REPOSITORY_ROOT = join(import.meta.dirname, "..");
const PLAYWRIGHT = createRequire(import.meta.url).resolve(
  "@playwright/test/cli",
);
const LISTED_FEATURE = /^ +\[chromium\] › .+? › (\S+) › \S+$/gm;

await test("the e2e kit registers every journey of e2e/journeys, the smoke journey first: fails on a journeys module the kit refuses, two journeys sharing an id, or a missing smoke feature", () => {
  const result = spawnSync(
    process.execPath,
    [PLAYWRIGHT, "test", "-c", "e2e", "--list"],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
    },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`;
  assert.equal(result.status, 0, output);
  assert.equal(
    Array.from(output.matchAll(LISTED_FEATURE), (match) => match[1])[0],
    suite.smoke,
    output,
  );
});

await test("the suite's playground exists: fails when e2e/journeys.config.ts names a folder that is not there", () => {
  assert.ok(
    existsSync(join(REPOSITORY_ROOT, suite.playground, "antelope.config.ts")),
    suite.playground,
  );
});
