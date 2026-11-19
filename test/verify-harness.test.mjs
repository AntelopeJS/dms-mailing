import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";

const REPOSITORY_ROOT = join(import.meta.dirname, "..");
const DMS_CONTROL = join(
  dirname(
    createRequire(import.meta.url).resolve("@antelopejs/dms/package.json"),
  ),
  "bin",
  "dms-control.mjs",
);

await test("the feature map covers every user-facing file, and every feature has described journeys and existing docs pages", () => {
  const result = spawnSync(process.execPath, [DMS_CONTROL, "map"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`,
  );
});
