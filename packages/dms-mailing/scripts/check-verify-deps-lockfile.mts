import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";

/**
 * The verify skill installs its playground packages from `deps/` with a frozen
 * lockfile, so a `deps/package.json` bump without a regenerated lockfile breaks
 * `dms-control up --prepare` on every run. Checks the lockfile against the
 * manifest without installing anything, whatever release-age policy the host's
 * pnpm applies to new installs. Prints the failure only; exits 1 on it.
 */

const REPOSITORY_ROOT = join(import.meta.dirname, "..", "..", "..");
const DEPS = join(REPOSITORY_ROOT, ".agents/skills/verify-dms-mailing/deps");
const OUTDATED_LOCKFILE = "ERR_PNPM_OUTDATED_LOCKFILE";

const PNPM_ARGS = [
  "install",
  "--dir",
  DEPS,
  "--ignore-workspace",
  "--frozen-lockfile",
  "--lockfile-only",
  "--ignore-scripts",
  "--config.minimum-release-age=0",
];

/**
 * On Windows `pnpm` is a `.cmd` shim, which only cmd.exe starts: the call runs
 * there as one line with each argument quoted, none of which holds a `"` or `%`.
 */
const result =
  process.platform === "win32"
    ? spawnSync(
        ["pnpm", ...PNPM_ARGS].map((argument) => `"${argument}"`).join(" "),
        {
          encoding: "utf8",
          shell: true,
        },
      )
    : spawnSync("pnpm", PNPM_ARGS, { encoding: "utf8" });

if (result.status !== 0) {
  const output = `${result.stdout}${result.stderr}`;
  const deps = relative(REPOSITORY_ROOT, DEPS);
  process.stderr.write(
    output.includes(OUTDATED_LOCKFILE)
      ? `${deps}/pnpm-lock.yaml does not match ${deps}/package.json: run \`pnpm install --dir ${deps} --ignore-workspace --lockfile-only\`.\n`
      : `${deps}: pnpm could not check the lockfile: ${result.error?.message ?? output.trim()}\n`,
  );
  process.exitCode = 1;
}
