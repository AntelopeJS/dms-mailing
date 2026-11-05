import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSpec, EXIT } from "@antelopejs/tooling-configs/formal";

const SCRIPT = fileURLToPath(import.meta.url);
const SKILL = dirname(SCRIPT);
const REPO = resolve(SKILL, "../../..");
const SPEC = "MailingEvents";
const EVENTS_SOURCE = "packages/dms-mailing/src/services/events.ts";
const TYPES_SOURCE = "packages/dms-mailing/src/types/sends.ts";

/**
 * The invariants each configuration breaks on the current code, with the number of states in TLC's shortest
 * counterexample. SKILL.md tells each one as a finding.
 *
 * @type {Record<string, Record<string, number>>}
 */
const FINDINGS = {
  fold: { StatusFollowsEventTime: 9 },
  race: { CountedOnce: 9 },
};

/**
 * The text a `const` of a source file is initialised with.
 *
 * @param {string} file A repository path
 * @param {string} name The constant
 * @returns {string} What follows its `=`, up to the `;` that ends the line
 */
function initializer(file, name) {
  const source = readFileSync(join(REPO, file), "utf8");
  const match = new RegExp(String.raw`^(?:export )?const ${name}\b[^=]*=\s*([\s\S]*?);$`, "m").exec(source);
  if (!match) throw new Error(`cannot read ${name} from ${file}; MailingTables.tla is built from it, update check.mjs`);
  return match[1];
}

/**
 * @param {string} text An initializer
 * @param {RegExp} pattern A global pattern with one or two groups
 * @returns {string[][]} The groups of each match
 */
function groups(text, pattern) {
  return Array.from(text.matchAll(pattern), (match) => match.slice(1));
}

/**
 * @param {string[]} items Strings
 * @returns {string} A TLA+ set of them
 */
function tlaSet(items) {
  return `{${items.map((item) => JSON.stringify(item)).join(", ")}}`;
}

/**
 * @param {string[][]} entries Field and TLA+ value pairs
 * @returns {string} A TLA+ record of them, or an empty function when there is none
 */
function tlaRecord(entries) {
  if (entries.length === 0) return String.raw`[field \in {} |-> 0]`;
  return `[${entries.map(([field, value]) => `${field} |-> ${value}`).join(", ")}]`;
}

/**
 * The status tables of `services/events.ts` and the webhook's event types, as the TLA+ module the spec extends.
 *
 * @returns {string} `MailingTables.tla`
 */
function tablesModule() {
  const rank = groups(initializer(EVENTS_SOURCE, "RANK"), /(\w+): (\d+)/g);
  const counters = groups(initializer(EVENTS_SOURCE, "COUNTERS"), /(\w+): "(\w+)"/g);
  const deferrable = groups(initializer(EVENTS_SOURCE, "DEFERRABLE_STATUSES"), /"(\w+)"/g).flat();
  const eventTypes = groups(initializer(TYPES_SOURCE, "SEND_EVENT_TYPES"), /"(\w+)"/g).flat();
  const attempts = initializer(EVENTS_SOURCE, "MAX_ACTIVITY_ATTEMPTS");
  const statuses = rank.map(([status]) => status);
  const unranked = [...eventTypes, ...deferrable, "delivered"].filter((status) => !statuses.includes(status));
  if (unranked.length > 0) throw new Error(`RANK in ${EVENTS_SOURCE} has no rank for ${unranked.join(", ")}`);
  if (!/^\d+$/.test(attempts)) throw new Error(`MAX_ACTIVITY_ATTEMPTS in ${EVENTS_SOURCE} is not a number`);
  return [
    "---- MODULE MailingTables ----",
    `SendStatuses == ${tlaSet(statuses)}`,
    `SendEventTypes == ${tlaSet(eventTypes)}`,
    `Rank == ${tlaRecord(rank)}`,
    `DeferrableStatuses == ${tlaSet(deferrable)}`,
    `Counters == ${tlaRecord(counters.map(([type, field]) => [type, JSON.stringify(field)]))}`,
    `MaxActivityAttempts == ${attempts}`,
    "====",
    "",
  ].join("\n");
}

/**
 * Writes the spec, both configurations and the tables read from the code into one folder.
 *
 * @param {string} dir The folder
 */
function writeModel(dir) {
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(SKILL, `${SPEC}.tla`), join(dir, `${SPEC}.tla`));
  for (const config of Object.keys(FINDINGS)) copyFileSync(join(SKILL, `${config}.cfg`), join(dir, `${config}.cfg`));
  writeFileSync(join(dir, "MailingTables.tla"), tablesModule());
}

/**
 * Checks one configuration with the pinned TLC; exits 1 when a rule differs from FINDINGS.
 *
 * @param {string} config `fold` or `race`
 * @returns {Promise<void>}
 */
async function checkConfig(config) {
  if (!Object.hasOwn(FINDINGS, config)) throw new Error(`unknown configuration ${config}`);
  const dir = mkdtempSync(join(tmpdir(), "formal-dms-mailing-"));
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  writeModel(dir);
  await checkSpec({ dir, spec: SPEC, config, findings: FINDINGS[config] });
}

/**
 * Checks every configuration, each in its own process because a changed rule exits it.
 *
 * @returns {number} The worst exit code
 */
function checkAll() {
  let worst = EXIT.ok;
  for (const config of Object.keys(FINDINGS)) {
    const run = spawnSync(process.execPath, [SCRIPT, config], { stdio: "inherit" });
    worst = Math.max(worst, run.status ?? EXIT.tool);
  }
  return worst;
}

/**
 * `check.mjs` checks every configuration, `check.mjs <config>` one, `check.mjs --model <dir>` writes the model
 * TLC reads without running it.
 *
 * @param {string[]} args The command line
 * @returns {Promise<number>} The exit code
 */
async function main(args) {
  const [first, second] = args;
  if (first === undefined) return checkAll();
  if (first === "--model" && second) {
    writeModel(resolve(second));
    return EXIT.ok;
  }
  await checkConfig(first);
  return EXIT.ok;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(`check: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = EXIT.tool;
}
