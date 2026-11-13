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
 * The pnpm that runs this script, from the `npm_execpath` its `pnpm run` sets:
 * its JavaScript entry runs under this Node, its native binary runs as is. The
 * `pnpm` on `PATH` is the fallback; on Windows that is a `.cmd` shim, which
 * `spawnSync` cannot start without a shell.
 */
function pnpmCommand() {
  const execPath = process.env["npm_execpath"];
  if (execPath === undefined || execPath === "") {
    return { command: "pnpm", prefix: [] };
  }
  return /\.[cm]?js$/u.test(execPath)
    ? { command: process.execPath, prefix: [execPath] }
    : { command: execPath, prefix: [] };
}

const pnpm = pnpmCommand();
const result = spawnSync(pnpm.command, [...pnpm.prefix, ...PNPM_ARGS], {
  encoding: "utf8",
});

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
