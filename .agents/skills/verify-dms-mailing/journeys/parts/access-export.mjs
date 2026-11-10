import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { check, list, mailing, parseJson, pick, text, texts } from "../../mailing.mjs";
import { declareLive, secretOf } from "./api-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const COUNT = 201;
const ENTRIES = ["templates.json", "template-versions.json", "settings.json", "suppressions.json"];

/**
 * @param {Ctx} ctx The journey
 * @returns {Promise<void>}
 */
async function seed(ctx) {
  await declareLive(ctx, "export-one", { name: { en: "Export one", fr: "Export un" }, variables: [] });
  const second = await declareLive(ctx, "export-two", { name: { en: "Export two" }, variables: [] });
  const content = { locales: { en: { subject: "Edited", preheader: "", blocks: [] } } };
  await mailing(ctx, "edit the second template", "POST", `/templates/${second.id}/content`, { body: { content } });
  await mailing(ctx, "publish it", "POST", `/templates/${second.id}/publish`, { body: {} });
  await mailing(ctx, "set a sender", "PUT", "/settings", { body: { senderName: "Exporter", senderEmail: "export@acme.example", logRetentionDays: 45 } });
  const added = [];
  for (let index = 0; index < COUNT; index += 1) {
    const email = `bulk${String(index).padStart(3, "0")}@verify.local`;
    added.push((await mailing(ctx, `suppress ${index}`, "POST", "/suppressions", { body: { email, note: `n${index}` } })).status);
  }
  await ctx.verify(`${COUNT} addresses are on the list`, [check("all added", added.every((status) => status === 200), added.filter((status) => status !== 200).length)], { critical: true });
}

/**
 * Builds the archive and returns what it holds.
 *
 * @param {Ctx} ctx The journey
 * @returns {Promise<{ names: string[], read: (entry: string) => string, prefix: string }>} The entry names and a reader
 */
async function archiveOf(ctx) {
  const dir = join(ctx.state.dir, "export");
  mkdirSync(dir, { recursive: true });
  const archive = join(dir, `${String(ctx.state.journeyCount ?? 0)}.zip`);
  const built = await ctx.api("build the export archive", { method: "POST", path: "/verify-mailing/export", body: { tenantId: "default", localPath: archive }, as: "anon" });
  await ctx.verify("the archive is built without a failing contributor", [
    check("HTTP 200, not partial, no failure", built.status === 200 && pick(built.body, "partial") === false && list(built.body, "failures").length === 0, built.body),
    check("the file exists", existsSync(archive) && statSync(archive).size > 0, archive),
  ], { critical: true });
  const read = (/** @type {string} */ entry) => spawnSync("unzip", ["-p", archive, entry], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stdout;
  const names = spawnSync("unzip", ["-Z1", archive], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  const prefix = names.find((name) => name.endsWith("/suppressions.json"))?.replace(/suppressions\.json$/, "") ?? "modules/mailing/";
  return { names, read, prefix };
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
export const exportJourney = {
  id: "the-workspace-data-export-carries-templates-versions-settings-and-suppressions",
  title: "the tenant data export holds templates.json, template-versions.json, settings.json (without the webhook secret) and suppressions.json under the mailing module's folder, each complete (more than one page of 200 rows) and with the names in every language, and the manifest says the module did not fail",
  entryPoint: "Hook.TENANT_DATA_EXPORT (RegisterTenantDataExportContributor)",
  async run(ctx) {
    await seed(ctx);
    const secret = await secretOf(ctx);
    const archive = await archiveOf(ctx);
    const { names, read, prefix } = archive;
    const manifest = parseJson(read("manifest.json"));
    const mine = list(manifest, "modules").find((entry) => text(entry, "moduleId").includes("mailing"));
    const entries = texts(mine, "entries");
    await ctx.verify("the four entries are under the module's folder and the manifest lists them", [
      check("the four entries", ENTRIES.every((entry) => names.includes(`${prefix}${entry}`)), names),
      check("the manifest has the module, not failed", mine !== undefined && pick(mine, "failed") === false, mine),
      check("the manifest lists the four entries", ENTRIES.every((entry) => entries.some((listed) => listed.endsWith(entry))), entries),
    ]);
    const suppressions = list(parseJson(read(`${prefix}suppressions.json`)));
    const emails = suppressions.map((row) => text(row, "email"));
    await ctx.verify("suppressions.json holds every entry once, across pages of 200", [
      check(`${COUNT} rows`, suppressions.length === COUNT, suppressions.length),
      check("each address once, the first and the last present", new Set(emails).size === COUNT && emails.includes("bulk000@verify.local") && emails.includes("bulk200@verify.local"), new Set(emails).size),
      check("an entry carries its reason, note and creation date", text(suppressions[0], "reason") === "manual" && text(suppressions[0], "detail").startsWith("n") && text(suppressions[0], "createdAt") !== "", suppressions[0]),
    ]);
    const templates = list(parseJson(read(`${prefix}templates.json`)));
    const one = templates.find((row) => text(row, "slug") === "export-one");
    const versions = list(parseJson(read(`${prefix}template-versions.json`)));
    await ctx.verify("templates.json and template-versions.json", [
      check("both templates", templates.length === 2, templates.map((row) => row.slug)),
      check("the name in every language", text(one, "name", "en") === "Export one" && text(one, "name", "fr") === "Export un", pick(one, "name")),
      check("the versions: 1 for each template and 2 for the edited one", versions.length >= 3 && versions.some((row) => row.version === 2), versions.map((row) => [row.templateId, row.version])),
    ]);
    const settingsText = read(`${prefix}settings.json`);
    const settings = parseJson(settingsText);
    await ctx.verify("settings.json carries the settings but never the webhook secret", [
      check("sender, retention and locale", text(settings, "senderName") === "Exporter" && text(settings, "senderEmail") === "export@acme.example" && pick(settings, "logRetentionDays") === 45 && text(settings, "fallbackLocale") === "en", settings),
      check("the five categories", list(settings, "categories").length === 5, list(settings, "categories").length),
      check("no webhookSecret field and the secret appears nowhere in the file", pick(settings, "webhookSecret") === undefined && !settingsText.includes(secret), "leaked"),
    ]);
  },
};
