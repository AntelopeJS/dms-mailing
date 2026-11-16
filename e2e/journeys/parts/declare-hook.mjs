import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { check, list, mailing, pick, text } from "../../mailing.mjs";
import { paragraph, sendCode } from "./api-kit.mjs";
import { declaration } from "./declare-template.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

/**
 * @param {string} subject The subject
 * @returns {Record<string, unknown>} A content with one locale
 */
const content = (subject) => ({ locales: { en: { subject, preheader: "", blocks: [paragraph("p", "Hello")] } } });

/** @type {{ id: string, title: string, entryPoint: string, onboard: boolean, run: (ctx: Ctx) => Promise<void> }} */
export const hookJourney = {
  id: "declarations-made-when-the-workspace-is-provisioned-run-once",
  title: "calls made from a Hook.TENANT_BEING_PROVISIONED handler (sender, category, templates) are in place when the owner first opens the new workspace, a repeated declaration of a slug keeps the first, and a later start of the backend on the same workspace runs nothing again",
  entryPoint: "Hook.TENANT_BEING_PROVISIONED, VERIFY_MAILING_DECLARE",
  onboard: false,
  async run(ctx) {
    const file = join(ctx.state.dir, "declare.json");
    const tenant = "$tenant";
    const steps = [
      { fn: "sender", args: [{ tenantId: tenant, name: "Provisioned", email: "hello@provisioned.example", replyTo: "reply@provisioned.example" }] },
      { fn: "category", args: [{ tenantId: tenant, id: "hooked", label: { en: "Hooked", fr: "Accroché" }, icon: "i-ph-anchor" }] },
      { fn: "template", args: [{ ...declaration("hook-welcome", { tenantId: tenant, category: "hooked", content: content("First subject") }) }] },
      { fn: "template", args: [{ ...declaration("hook-welcome", { tenantId: tenant, category: "hooked", content: content("Second subject") }) }] },
      { fn: "template", args: [{ ...declaration("hook-broken", { tenantId: tenant, name: { fr: "sans anglais" } }) }] },
    ];
    writeFileSync(file, JSON.stringify(steps));
    const previous = { ...ctx.state.extraEnv };
    ctx.state.database = `${ctx.state.databasePrefix}_provisioned`;
    ctx.state.extraEnv = { ...previous, VERIFY_MAILING_DECLARE: file };
    try {
      await ctx.restartBackend();
      await ctx.onboard();
      const settings = (await mailing(ctx, "read the settings", "GET", "/settings")).body;
      const categories = list(settings, "categories");
      const rows = list((await mailing(ctx, "list the templates", "GET", "/tables/templates/list?limit=50")).body, "results");
      const sent = await sendCode(ctx, "send the declared template", "hook-welcome", { to: ctx.email("hook"), variables: {} });
      const arrived = await ctx.mail((message) => message.to.some((address) => address.includes(ctx.email("hook"))));
      await ctx.verify("what the handler declared is there when the owner arrives", [
        check("the sender", text(settings, "senderName") === "Provisioned" && text(settings, "senderEmail") === "hello@provisioned.example" && text(settings, "replyTo") === "reply@provisioned.example", settings),
        check("the category, after the five defaults", categories.length === 6 && text(categories[5], "id") === "hooked" && text(categories[5], "label", "fr") === "Accroché", categories.map((row) => row.id)),
        check("one live template in that category, at version 1", rows.length === 1 && text(rows[0], "slug") === "hook-welcome" && text(rows[0], "status") === "live" && pick(rows[0], "publishedVersion") === 1 && text(rows[0], "category") === "hooked", rows),
        check("the second declaration of the slug was kept, not applied", sent.ok && arrived.match?.subject === "First subject", arrived.match?.subject),
        check("the invalid declaration made no template", !rows.some((row) => text(row, "slug") === "hook-broken"), rows.map((row) => row.slug)),
      ]);
      writeFileSync(file, JSON.stringify([{ fn: "template", args: [declaration("hook-later", { tenantId: tenant })] }, { fn: "sender", args: [{ tenantId: tenant, email: "later@provisioned.example" }] }]));
      await ctx.restartBackend();
      const later = list((await mailing(ctx, "list the templates after a restart", "GET", "/tables/templates/list?limit=50")).body, "results");
      const settingsLater = (await mailing(ctx, "read the settings after a restart", "GET", "/settings")).body;
      await ctx.verify("a later start of the same workspace declares nothing", [
        check("hook-later does not exist", !later.some((row) => text(row, "slug") === "hook-later") && later.length === 1, later.map((row) => row.slug)),
        check("the sender is the provisioned one", text(settingsLater, "senderEmail") === "hello@provisioned.example", settingsLater),
      ]);
    } finally {
      ctx.state.extraEnv = previous;
    }
  },
};
