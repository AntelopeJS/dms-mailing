import { calling, check, list, mailing, pick, text } from "../../mailing.mjs";
import { putSettings } from "./settings-basics.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const category = (/** @type {string} */ id, /** @type {Record<string, string>} */ label, icon = "i-ph-repeat", tenantId = "default") => ({ tenantId, id, label, icon });

/**
 * @param {Ctx} ctx The journey
 * @returns {Promise<Array<Record<string, unknown>>>} The stored categories
 */
async function stored(ctx) {
  return list((await mailing(ctx, "read the settings", "GET", "/settings")).body, "categories");
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} */
export const settingsDeclarations = [
  {
    id: "declare-template-category-adds-once-and-keeps-existing-ids",
    title: "DeclareTemplateCategory adds a new category last (created) and leaves an id the settings already hold as it is (kept), the defaults among them; it rejects a label without English, a bad icon, a bad id and a blank tenantId with invalid_category",
    entryPoint: "DeclareTemplateCategory(declaration)",
    async run(ctx) {
      await mailing(ctx, "open the settings", "GET", "/settings");
      const call = (/** @type {string} */ label, /** @type {Record<string, unknown>} */ body) => calling(ctx, label, "category", [body]);
      const created = await call("declare a new category", category("subscriptions", { en: "Subscriptions", fr: "Abonnements" }));
      const kept = await call("declare it again with another label", category("subscriptions", { en: "Changed" }, "i-ph-bell"));
      const keptDefault = await call("declare a default id", category("orders", { en: "Replaced" }, "i-ph-bell"));
      const list1 = await stored(ctx);
      await ctx.verify("a new id is added last, a known id is kept", [
        check("created", created.ok && pick(created.result, "outcome") === "created" && text(created.result, "id") === "subscriptions", created),
        check("kept for the same id", kept.ok && pick(kept.result, "outcome") === "kept", kept),
        check("kept for a default id", keptDefault.ok && pick(keptDefault.result, "outcome") === "kept", keptDefault),
        check("six categories, the new one last with its labels and icon", list1.length === 6 && text(list1[5], "id") === "subscriptions" && text(list1[5], "label", "fr") === "Abonnements" && text(list1[5], "icon") === "i-ph-repeat", list1.map((row) => row.id)),
        check("the default Orders is unchanged", text(list1[0], "label", "en") === "Orders" && text(list1[0], "icon") === "i-ph-package", list1[0]),
      ]);
      /** @type {Array<[string, Record<string, unknown>]>} */
      const bad = [
        ["a label without an English text", category("french-only", { fr: "Seulement" })],
        ["a blank English label", category("blank-label", { en: " " })],
        ["an icon that is not a Phosphor name", category("bad-icon", { en: "Bad" }, "tag")],
        ["an id that is not a slug", category("Not A Slug", { en: "Bad" })],
        ["a blank tenantId", category("no-tenant", { en: "Bad" }, "i-ph-tag", "  ")],
        ["a duplicate label", category("copy", { en: "Subscriptions" })],
      ];
      for (const [label, body] of bad) {
        const outcome = await call(`declare ${label}`, body);
        await ctx.verify(`${label} is rejected`, [check("invalid_category", !outcome.ok && outcome.error?.code === "invalid_category", outcome.error ?? outcome.result)]);
      }
      await ctx.verify("the refused declarations added nothing", [check("still six categories", (await stored(ctx)).length === 6, (await stored(ctx)).map((row) => row.id))]);
      const concurrent = await Promise.all(["a-one", "a-two", "a-three"].map((id) => call(`declare ${id} at once`, category(id, { en: id }))));
      await ctx.verify("several declarations at once lose none", [
        check("all created", concurrent.every((outcome) => outcome.ok && pick(outcome.result, "outcome") === "created"), concurrent),
        check("nine categories", (await stored(ctx)).length === 9, (await stored(ctx)).map((row) => row.id)),
      ]);
    },
  },
  {
    id: "declare-sender-writes-the-sender-section-and-later-edits-are-the-users",
    title: "DeclareSender replaces the stored sender (name, address, reply-to; the ones it omits are cleared), needs an address and an explicit tenantId, and a later edit in the settings stays",
    entryPoint: "DeclareSender(declaration)",
    async run(ctx) {
      await putSettings(ctx, "store a sender by hand", { senderName: "Old Name", senderEmail: "old@example.test", replyTo: "oldreply@example.test" });
      const call = (/** @type {string} */ label, /** @type {Record<string, unknown>} */ body) => calling(ctx, label, "sender", [body]);
      const full = await call("declare a full sender", { tenantId: "default", name: "Acme", email: "hello@acme.example", replyTo: "answers@acme.example" });
      const settings1 = (await mailing(ctx, "read the settings", "GET", "/settings")).body;
      await ctx.verify("the declared sender replaces the stored one", [
        check("the call resolves", full.ok, full),
        check("name, address and reply-to are the declared ones", text(settings1, "senderName") === "Acme" && text(settings1, "senderEmail") === "hello@acme.example" && text(settings1, "replyTo") === "answers@acme.example", settings1),
      ]);
      const minimal = await call("declare an address only", { tenantId: "default", email: "only@acme.example" });
      const settings2 = (await mailing(ctx, "read the settings", "GET", "/settings")).body;
      await ctx.verify("omitted name and reply-to are cleared", [
        check("the address only", minimal.ok && text(settings2, "senderName") === "" && text(settings2, "senderEmail") === "only@acme.example" && text(settings2, "replyTo") === "", settings2),
      ]);
      await putSettings(ctx, "edit the sender in the settings", { senderName: "Edited by the owner" });
      const settings3 = (await mailing(ctx, "read the settings", "GET", "/settings")).body;
      await ctx.verify("a later edit stays", [check("the owner's name", text(settings3, "senderName") === "Edited by the owner" && text(settings3, "senderEmail") === "only@acme.example", settings3)]);
      /** @type {Array<[string, Record<string, unknown>]>} */
      const bad = [
        ["no address", { tenantId: "default", name: "Acme" }],
        ["a blank address", { tenantId: "default", email: "  " }],
        ["an address that is not one", { tenantId: "default", email: "nobody" }],
        ["a blank tenantId", { tenantId: "   ", email: "x@acme.example" }],
        ["a missing tenantId", { email: "x@acme.example" }],
        ["a reply-to that is not an address", { tenantId: "default", email: "x@acme.example", replyTo: "nope" }],
      ];
      for (const [label, body] of bad) {
        const outcome = await call(`declare ${label}`, body);
        await ctx.verify(`${label} is rejected`, [check("invalid_sender", !outcome.ok && outcome.error?.code === "invalid_sender", outcome.error ?? outcome.result)]);
      }
      const settings4 = (await mailing(ctx, "read the settings", "GET", "/settings")).body;
      await ctx.verify("the refused declarations changed nothing", [check("still the owner's sender", text(settings4, "senderName") === "Edited by the owner" && text(settings4, "senderEmail") === "only@acme.example", settings4)]);
    },
  },
];
