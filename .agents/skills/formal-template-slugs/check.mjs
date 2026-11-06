import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSpec, EXIT } from "@antelopejs/tooling-configs/formal";
import verifyConfig from "../verify-dms-mailing/verify.config.ts";

const SKILL = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SKILL, "../../..");
const SPEC = "TemplateSlugs";
const CONFIG = "slugs";
const CHECK_NAME = "template-slugs";
const COVERED_RECORD = join(SKILL, "covered.json");
const SOURCE = "packages/dms-mailing/src";
const TABLE_SOURCE = `${SOURCE}/db/tables/templates.table.ts`;
const SERVICE_SOURCE = `${SOURCE}/services/templates.ts`;
const DATA_SOURCE = `${SOURCE}/data/templates-table.ts`;
const ROUTE_SOURCE = `${SOURCE}/routes/templates.ts`;
const DECLARATION_SOURCE = `${SOURCE}/services/declarations.ts`;
const SLUG = "slug";

/**
 * The invariants that break on the current code, with the number of states in TLC's shortest counterexample. SKILL.md
 * tells each one as a finding. None breaks today.
 *
 * @type {Record<string, number>}
 */
const FINDINGS = {};

/**
 * @param {string} file A repository path
 * @returns {string} The file's text
 */
function source(file) {
  return readFileSync(join(REPO, file), "utf8");
}

/**
 * @param {string} text A source file
 * @param {string} start What opens the part
 * @returns {string} The text from `start` to the next closing brace at the start of a line, empty when `start` is absent
 */
function section(text, start) {
  const from = text.indexOf(start);
  if (from < 0) return "";
  const end = text.indexOf("\n}\n", from);
  return end < 0 ? text.slice(from) : text.slice(from, end + 2);
}

/**
 * Whether the unique index decorates the slug column.
 *
 * @returns {boolean} Whether `@Index({ unique: true })` sits on `declare slug` with no `group`, and no other column
 *   joins the `slug` group, either of which would make the slug unique only together with another column
 */
function uniqueSlug() {
  const text = source(TABLE_SOURCE);
  const decorators = /((?:@\w+\([^)]*\)\s*)*)declare slug\b/.exec(text)?.[1] ?? "";
  const options = /@Index\(\{([^}]*)\}\)/.exec(decorators)?.[1] ?? "";
  const joined = /\bgroup\s*:\s*["'`]slug["'`]/.test(text);
  return /\bunique:\s*true\b/.test(options) && !/\bgroup\s*:/.test(options) && !joined;
}

/**
 * Whether `refuseTakenSlug` answers 409 for a duplicate key on the slug field.
 *
 * @returns {boolean} Whether the `try` awaits the write, so its rejection reaches the catch, and the catch maps
 *   `IsDuplicateKeyError` on the slug to `HTTP_CONFLICT`
 */
function refusesTakenSlug() {
  const text = source(SERVICE_SOURCE);
  const body = section(text, "function refuseTakenSlug");
  if (!/try\s*\{\s*return await \w+;\s*\}/.test(body)) return false;
  const field = /IsDuplicateKeyError\(\w+\)\s*&&\s*\w+\.fields\.includes\((\w+|"[^"]*")\)\)\s*throw new HTTPResult\(HTTP_CONFLICT\b/.exec(body)?.[1];
  if (field === undefined) return false;
  const constant = new RegExp(String.raw`\bconst ${field}\s*=\s*"([^"]*)"`).exec(text)?.[1];
  return (constant ?? field.replaceAll('"', "")) === SLUG;
}

/**
 * Whether the data API's `new` awaits `refuseTakenSlug` around the controller insert.
 *
 * @returns {boolean} Whether `withSeeding` wraps `base.func.call` in `refuseTakenSlug`
 */
function newRefusesTaken() {
  const body = section(source(DATA_SOURCE), "function withSeeding");
  return /await refuseTakenSlug\(\s*(?:Promise\.resolve\(\s*)?base\.func\.call\(/.test(body);
}

/**
 * Whether the duplicate route awaits `refuseTakenSlug` around its insert.
 *
 * @returns {boolean} Whether `duplicate` wraps `insertFields` in `refuseTakenSlug`
 */
function duplicateRefusesTaken() {
  const text = source(ROUTE_SOURCE);
  const from = text.indexOf("async duplicate(");
  if (from < 0) return false;
  return /await refuseTakenSlug\(\s*this\.templates\.insertFields\(/.test(text.slice(from));
}

/**
 * Whether a declaration that loses the race answers with the winner.
 *
 * @returns {boolean} Whether `createDeclared`'s `try` holds the insert with no inner catch and its catch returns
 *   undefined on a duplicate key, and `declareTemplate` re-reads the slug after it
 */
function declareKeepsWinner() {
  const text = source(DECLARATION_SOURCE);
  const create = section(text, "async function createDeclared(");
  const declare = section(text, "export async function declareTemplate(");
  const guarded =
    /try\s*\{([\s\S]*?)\}\s*catch\s*\((\w+)\)\s*\{\s*if\s*\(IsDuplicateKeyError\(\2\)\)\s*return undefined;\s*throw \2;\s*\}/.exec(create);
  const returnsUndefined =
    guarded !== null && /await \w+\.insertFields\(/.test(guarded[1]) && !/\bcatch\b/.test(guarded[1]);
  const after = declare.slice(declare.indexOf("await createDeclared(") + 1);
  const rereads = declare.includes("await createDeclared(") && /getBySlug\(/.test(after) && /"kept"/.test(after);
  return returnsUndefined && rereads;
}

/**
 * The guards of the code, as the TLA+ module the spec extends. A guard the code no longer has reads FALSE, so the
 * invariants decide what that breaks.
 *
 * @returns {string} `SlugGuards.tla`
 */
function guardsModule() {
  return [
    "---- MODULE SlugGuards ----",
    `UniqueSlug == ${uniqueSlug() ? "TRUE" : "FALSE"}`,
    `RefusesTakenSlug == ${refusesTakenSlug() ? "TRUE" : "FALSE"}`,
    `NewRefusesTaken == ${newRefusesTaken() ? "TRUE" : "FALSE"}`,
    `DuplicateRefusesTaken == ${duplicateRefusesTaken() ? "TRUE" : "FALSE"}`,
    `DeclareKeepsWinner == ${declareKeepsWinner() ? "TRUE" : "FALSE"}`,
    "====",
    "",
  ].join("\n");
}

/**
 * Writes the spec, its configuration and the guards read from the code into one folder.
 *
 * @param {string} dir The folder
 */
function writeModel(dir) {
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(SKILL, `${SPEC}.tla`), join(dir, `${SPEC}.tla`));
  copyFileSync(join(SKILL, `${CONFIG}.cfg`), join(dir, `${CONFIG}.cfg`));
  writeFileSync(join(dir, "SlugGuards.tla"), guardsModule());
}

/**
 * The SHA-256 of each file the `template-slugs` check of verify.config.ts covers, as the code stands now.
 *
 * @returns {Record<string, string>} Each covered path and its digest
 */
function coveredDigests() {
  const check = verifyConfig.formal.find((entry) => entry.name === CHECK_NAME);
  if (!check) throw new Error(`verify.config.ts has no formal check named ${CHECK_NAME}`);
  return Object.fromEntries(
    check.covers.map((file) => [file, createHash("sha256").update(readFileSync(join(REPO, file))).digest("hex")]),
  );
}

/**
 * @param {unknown} value A parsed JSON value
 * @returns {value is Record<string, unknown>} Whether it is a JSON object
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Prints the `ModelInSync` rule: every covered file still has the digest `covered.json` recorded when the model was
 * last read against the code.
 *
 * @returns {boolean} Whether it holds
 */
function checkModelInSync() {
  /** @type {unknown} */
  const recorded = JSON.parse(readFileSync(COVERED_RECORD, "utf8"));
  const current = coveredDigests();
  const stale = Object.keys(current).filter(
    (file) => !isRecord(recorded) || !Object.hasOwn(recorded, file) || recorded[file] !== current[file],
  );
  if (stale.length === 0) {
    console.log(`holds  ModelInSync (${Object.keys(current).length} covered files)`);
    return true;
  }
  console.log(
    `BROKEN ModelInSync: ${stale.join(", ")} changed since covered.json; update the model to the code, then run check.mjs --sync`,
  );
  return false;
}

/**
 * Model-checks the spec with the pinned TLC; `checkSpec` exits 1 when a rule differs from FINDINGS.
 *
 * @returns {Promise<number>} The exit code
 */
async function checkAll() {
  const inSync = checkModelInSync();
  const dir = mkdtempSync(join(tmpdir(), "formal-template-slugs-"));
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  writeModel(dir);
  await checkSpec({ dir, spec: SPEC, config: CONFIG, findings: FINDINGS });
  return inSync ? EXIT.ok : EXIT.changed;
}

/**
 * `check.mjs` checks every rule, `check.mjs --model <dir>` writes the model TLC reads without running it, and
 * `check.mjs --sync` records the covered files' digests in `covered.json`.
 *
 * @param {string[]} args The command line
 * @returns {Promise<number>} The exit code
 */
async function main(args) {
  const [first, second] = args;
  if (first === undefined) return checkAll();
  if (first === "--sync") {
    writeFileSync(COVERED_RECORD, `${JSON.stringify(coveredDigests(), null, 2)}\n`);
    return EXIT.ok;
  }
  if (first === "--model" && second) {
    writeModel(resolve(second));
    return EXIT.ok;
  }
  throw new Error(`unknown argument ${first}; use --model <dir> or --sync`);
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(`check: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = EXIT.tool;
}
