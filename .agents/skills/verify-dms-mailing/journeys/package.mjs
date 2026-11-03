import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { guarded } from "../guard.mjs";
import { check, isRow, parseJson, pick } from "../mailing.mjs";

/** @typedef {import("../mailing.mjs").Ctx} Ctx */

/**
 * Packs one package of the checkout the way a release would and lists the tarball.
 *
 * @param {Ctx} ctx The journey
 * @param {string} dir The package folder, from the checkout root
 * @returns {{ files: string[], manifest: unknown }} The packed paths and the packed manifest
 */
function packed(ctx, dir) {
  const folder = mkdtempSync(join(tmpdir(), "verify-dms-mailing-pack-"));
  try {
    const pack = spawnSync("npm", ["pack", "--ignore-scripts", "--silent", "--pack-destination", folder], { cwd: join(ctx.state.repo ?? ".", dir), encoding: "utf8" });
    const tarball = join(folder, pack.stdout.trim().split("\n").at(-1) ?? "");
    const listed = spawnSync("tar", ["-tzf", tarball], { encoding: "utf8" });
    const manifest = parseJson(spawnSync("tar", ["-xzOf", tarball, "package/package.json"], { encoding: "utf8" }).stdout);
    return { files: listed.stdout.split("\n").map((line) => line.replace(/^package\//, "")).filter(Boolean), manifest };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/**
 * @param {Ctx} ctx The journey
 * @param {string} file A file of the checkout
 * @returns {unknown} Its JSON
 */
function readJson(ctx, file) {
  return parseJson(readFileSync(join(ctx.state.repo ?? ".", file), "utf8"));
}

/**
 * The Supported cell of each row of the README compatibility table.
 *
 * @param {Ctx} ctx The journey
 * @returns {Map<string, string>} Package name to supported range
 */
function compatibility(ctx) {
  const readme = readFileSync(join(ctx.state.repo ?? ".", "packages/dms-mailing/README.md"), "utf8");
  return new Map([...readme.matchAll(/^\| `(@antelopejs\/[^`]+)`\s*\| `([^`]+)`/gm)].map((match) => [match[1] ?? "", match[2] ?? ""]));
}

/** What a project installs from the registry: the module, its dashboard layer, its skill, and the interface. */
export const journeys = guarded([
  {
    id: "the-module-tarball-holds-what-its-manifest-names",
    title: "the module's tarball holds the build, the dashboard layer, the agent skill and every path its manifest points at, without build info",
    entryPoint: "npm pack of packages/dms-mailing",
    database: "shared",
    onboard: false,
    async run(/** @type {Ctx} */ ctx) {
      const { files, manifest } = packed(ctx, "packages/dms-mailing");
      const targets = [pick(manifest, "main"), pick(manifest, "types"), pick(manifest, "exports", ".", "types"), pick(manifest, "exports", ".", "default"), pick(manifest, "dmsFrontend")].map((target) => String(target).replace(/^\.\//, ""));
      await ctx.verify("the packed module", [
        ...targets.map((target) => check(`${target} is packed`, files.includes(target), target)),
        check("it implements interface-dms-mailing", JSON.stringify(pick(manifest, "antelopeJs", "implements")) === JSON.stringify(["@antelopejs/interface-dms-mailing"]), pick(manifest, "antelopeJs")),
        check("the skill ships", JSON.stringify(pick(manifest, "antelopeJs", "skills")) === JSON.stringify(["./skills"]) && files.includes("skills/dms-mailing/SKILL.md") && files.includes("skills/dms-mailing/cases.json"), files.filter((file) => file.startsWith("skills/"))),
        check("the dashboard layer ships with its locales", files.includes("frontend-vue/dms.frontend.ts") && files.includes("frontend-vue/i18n/locales/mailing-en-GB.json") && files.includes("frontend-vue/i18n/locales/mailing-fr-FR.json"), files.filter((file) => file.includes("locales"))),
        check("test files are not packed", !files.some((file) => file.startsWith("dist/test") || file.startsWith("src/test")), files.filter((file) => file.includes("test"))),
        check("the e-mail template component ships", files.includes("frontend-vue/app/emails/EmailMailingTemplate.vue"), files.filter((file) => file.includes("emails"))),
        check("no build info", !files.some((file) => file.endsWith(".tsbuildinfo")), "tsbuildinfo"),
        check("public access", pick(manifest, "publishConfig", "access") === "public", pick(manifest, "publishConfig")),
      ]);
    },
  },
  {
    id: "the-interface-tarball-exports-the-contract",
    title: "the interface's tarball holds its build and its consumer reference, and its root export carries every function, constant and type its README lists",
    entryPoint: "npm pack of packages/interface-dms-mailing",
    database: "shared",
    onboard: false,
    async run(/** @type {Ctx} */ ctx) {
      const { files, manifest } = packed(ctx, "packages/interface-dms-mailing");
      const declarations = readFileSync(join(ctx.state.repo ?? ".", "packages/interface-dms-mailing/dist/index.d.ts"), "utf8");
      await ctx.verify("the packed interface", [
        check("name", pick(manifest, "name") === "@antelopejs/interface-dms-mailing", pick(manifest, "name")),
        check("main and types are packed", files.includes("dist/index.js") && files.includes("dist/index.d.ts"), files.slice(0, 10)),
        check("the consumer reference ships", files.includes("docs/1.index.md"), files.filter((file) => file.startsWith("docs/"))),
         ...["SendTemplate", "RecordEmailEvent", "DeclareTemplate", "DeclareTemplateCategory", "DeclareSender", "ImportSends", "LOCALIZED_TEXT_FALLBACK_LOCALE", "TemplateVariables", "MoneyValue", "SendTemplateParams", "SendTemplateResult", "EmailEvent", "SendEventType", "SendStatus", "TemplateDeclaration", "DeclareTemplateResult", "TemplateCategoryDeclaration", "DeclareTemplateCategoryResult", "SenderDeclaration", "ImportedSend", "SendImport", "ImportSendsResult", "Block", "TemplateContent", "VariableDefinition", "LocalizedText"].map((name) => check(`exports ${name}`, new RegExp(`export (declare )?(function|class|const|interface|type) ${name}\\b`).test(declarations), name)),
      ]);
    },
  },
  {
    id: "ranges-match-the-compatibility-table",
    title: "the README compatibility table lists the interface ranges the module depends on, its interface-dms-mailing range accepts the interface in the tree, and the dashboard layer pins its renderer minor",
    entryPoint: "packages/dms-mailing/README.md, package.json files",
    database: "shared",
    onboard: false,
    async run(/** @type {Ctx} */ ctx) {
      const table = compatibility(ctx);
      const module = readJson(ctx, "packages/dms-mailing/package.json");
      const iface = readJson(ctx, "packages/interface-dms-mailing/package.json");
      const frontend = readJson(ctx, "packages/dms-mailing/frontend-vue/package.json");
      const dependencies = pick(module, "dependencies");
      const interfaces = isRow(dependencies) ? Object.entries(dependencies).filter(([name]) => name.startsWith("@antelopejs/interface-")) : [];
      const range = String(pick(dependencies, "@antelopejs/interface-dms-mailing"));
      const version = String(pick(iface, "version"));
      const [floor, ceiling] = [/>=(\d+)\.(\d+)\.(\d+)/.exec(range), /<(\d+)\.(\d+)\.(\d+)/.exec(range)];
      /** @param {RegExpExecArray | null} match @returns {number} */
      const asNumber = (match) => (match ? Number(match[1]) * 1e6 + Number(match[2]) * 1e3 + Number(match[3]) : Number.NaN);
      const [major = "0", minor = "0", patch = "0"] = version.split(".");
      const current = Number(major) * 1e6 + Number(minor) * 1e3 + Number(patch);
      await ctx.verify("the ranges", [
        ...interfaces.map(([name, spec]) => check(`${name} is in the table with the same range`, table.get(name) === spec, [table.get(name), spec])),
        check("the interface-dms-mailing range accepts the tree's interface", current >= asNumber(floor) && current < asNumber(ceiling), [range, version]),
        check("the range stops below the next minor", ceiling !== null && Number(ceiling[2]) === Number(minor) + 1, range),
        check("the dashboard layer pins one renderer minor", /^>=\d+\.\d+\.\d+ <\d+\.\d+\.0$/.test(String(pick(frontend, "engines", "@antelopejs/dms-frontend"))), pick(frontend, "engines")),
      ]);
    },
  },
]);
