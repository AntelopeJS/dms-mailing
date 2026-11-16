import { check, list, mailing, pick, text, calling } from "../../mailing.mjs";
import { paragraph, sendCode } from "./api-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

/**
 * A valid template declaration for the default tenant.
 *
 * @param {string} slug The slug
 * @param {Record<string, unknown>} [over] Fields that differ
 * @returns {Record<string, unknown>} The declaration
 */
export function declaration(slug, over = {}) {
  return {
    tenantId: "default",
    slug,
    name: { en: `Name of ${slug}` },
    category: "orders",
    content: { locales: { en: { subject: `Subject of ${slug}`, preheader: "", blocks: [paragraph("p", "Hello {{customer.name}}")] } } },
    variables: [{ path: "customer.name", type: "string", required: false }],
    testData: { customer: { name: "Sofie" } },
    ...over,
  };
}

/**
 * @param {Ctx} ctx The journey
 * @param {string} label What the call does
 * @param {Record<string, unknown>} body The declaration
 */
export const declare = (ctx, label, body) => calling(ctx, label, "template", [body]);

/**
 * @param {Ctx} ctx The journey
 * @returns {Promise<Array<Record<string, unknown>>>} The rows of the templates table
 */
export async function templateRows(ctx) {
  return list((await mailing(ctx, "list the templates", "GET", "/tables/templates/list?limit=100")).body, "results");
}

/**
 * What a user edited, published and archived stays whatever the code declares again.
 *
 * @param {Ctx} ctx The journey
 * @param {string} id The declared template
 * @returns {Promise<void>}
 */
async function userEdits(ctx, id) {
  await mailing(ctx, "edit the draft", "POST", `/templates/${id}/content`, { body: { content: { locales: { en: { subject: "Edited by hand", preheader: "", blocks: [paragraph("p", "Edited")] } } } } });
  await mailing(ctx, "publish the edit", "POST", `/templates/${id}/publish`, { body: {} });
  const kept2 = await declare(ctx, "declare again after a publication", declaration("welcome"));
  const sent2 = await sendCode(ctx, "send after the publication", "welcome", { to: ctx.email("w3"), variables: {} });
  const mail2 = await ctx.mail((message) => message.to.some((address) => address.includes(ctx.email("w3"))));
  await ctx.verify("what a user published stays: kept, with the version it reached", [
    check("kept at version 2", pick(kept2.result, "outcome") === "kept" && pick(kept2.result, "version") === 2, kept2),
    check("the e-mail has the user's subject", sent2.ok && mail2.match?.subject === "Edited by hand", mail2.match?.subject),
  ]);

  await mailing(ctx, "archive the template", "POST", `/templates/${id}/archive`, { body: {} });
  const kept3 = await declare(ctx, "declare an archived template", declaration("welcome"));
  const blocked = await sendCode(ctx, "send an archived template", "welcome", { to: ctx.email("w4"), variables: {} });
  await ctx.verify("a kept declaration does not make the template live", [
    check("kept, with the last published version", pick(kept3.result, "outcome") === "kept" && pick(kept3.result, "version") === 2, kept3),
    check("SendTemplate still refuses it: template_not_live", !blocked.ok && blocked.error?.code === "template_not_live", blocked.error),
  ]);
}

/**
 * A removed category fails a new declaration only, and the author is shown as given.
 *
 * @param {Ctx} ctx The journey
 * @returns {Promise<void>}
 */
async function removedCategory(ctx) {
  await declare(ctx, "declare a template in billing", declaration("invoice", { category: "billing" }));
  const current = list((await mailing(ctx, "read the settings", "GET", "/settings")).body, "categories");
  await mailing(ctx, "remove the billing category", "PUT", "/settings", { body: { categories: current.filter((entry) => entry.id !== "billing").map((entry) => ({ id: entry.id, label: entry.label, icon: entry.icon })) } });
  const keptNoCategory = await declare(ctx, "declare the existing template whose category is gone", declaration("invoice", { category: "billing" }));
  const created = await declare(ctx, "declare a new template in the removed category", declaration("receipt", { category: "billing" }));
  const rows = await templateRows(ctx);
  await ctx.verify("a removed category fails a new declaration only", [
    check("the existing template is kept, without a category check", keptNoCategory.ok && pick(keptNoCategory.result, "outcome") === "kept", keptNoCategory),
    check("the new one rejects with unknown_category", !created.ok && created.error?.code === "unknown_category", created.error),
    check("and nothing was published for it", !rows.some((entry) => text(entry, "slug") === "receipt"), rows.map((entry) => entry.slug)),
  ]);

  const authored = await declare(ctx, "declare with an author", declaration("authored", { author: "Acme CI" }));
  const authoredRow = (await templateRows(ctx)).find((entry) => text(entry, "slug") === "authored");
  await ctx.verify("the author is shown as given", [check("created and authored by Acme CI", pick(authored.result, "outcome") === "created" && text(authoredRow, "updatedBy") === "Acme CI", authoredRow)]);
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} */
export const templateJourneys = [
  {
    id: "declare-template-creates-publishes-once-and-keeps-what-the-workspace-has",
    title: "DeclareTemplate creates a missing slug published as version 1 so SendTemplate works at once; declaring a slug the workspace has returns kept and writes nothing, whatever the code says now, after an edit, an unpublish or an archive; a removed category does not fail a kept declaration but does fail a new one",
    entryPoint: "DeclareTemplate(declaration), SendTemplate",
    async run(ctx) {
      const first = await declare(ctx, "declare the template", declaration("welcome"));
      const sent = await sendCode(ctx, "send it at once", "welcome", { to: ctx.email("w1"), variables: { customer: { name: "A" } } });
      const row = (await templateRows(ctx)).find((entry) => text(entry, "slug") === "welcome");
      await ctx.verify("a declared template is created published as version 1 and can send at once", [
        check("outcome created, version 1, a template id and the slug", first.ok && pick(first.result, "outcome") === "created" && pick(first.result, "version") === 1 && text(first.result, "slug") === "welcome" && text(first.result, "templateId") !== "", first),
        check("the table lists it live, version 1, authored by system", text(row, "status") === "live" && pick(row, "publishedVersion") === 1 && text(row, "updatedBy") === "system", row),
        check("its name and category are the declared ones", text(row, "name") === "Name of welcome" && text(row, "category") === "orders", row),
        check("SendTemplate sends it", text(sent.result, "status") === "sent", sent),
      ]);
      const again = await declare(ctx, "declare the same slug with other content", declaration("welcome", { name: { en: "Changed" }, content: { locales: { en: { subject: "Changed subject", preheader: "", blocks: [paragraph("p", "Changed")] } } }, category: "billing" }));
      const afterAgain = (await templateRows(ctx)).find((entry) => text(entry, "slug") === "welcome");
      const stillSent = await sendCode(ctx, "send after the second declaration", "welcome", { to: ctx.email("w2"), variables: {} });
      const arrived = await ctx.mail((message) => message.to.some((address) => address.includes(ctx.email("w2"))));
      await ctx.verify("a second declaration returns kept and changes nothing", [
        check("outcome kept, same template id, version 1", again.ok && pick(again.result, "outcome") === "kept" && text(again.result, "templateId") === text(first.result, "templateId") && pick(again.result, "version") === 1, again),
        check("name and category are untouched", text(afterAgain, "name") === "Name of welcome" && text(afterAgain, "category") === "orders", afterAgain),
        check("the e-mail still has the first subject", stillSent.ok && arrived.match?.subject === "Subject of welcome", arrived.match?.subject),
      ]);

      await userEdits(ctx, text(first.result, "templateId"));
      await removedCategory(ctx);
    },
  },
  {
    id: "declare-template-validates-like-the-dashboard-and-publishes-nothing-on-failure",
    title: "DeclareTemplate needs an explicit non-blank tenantId (an explicit default is valid) and rejects a bad slug, a name without an English text, no locale, a locale without a subject, an unknown block, a bad variable type and an unknown category with a code naming the rule and the field at fault; no template exists afterwards",
    entryPoint: "DeclareTemplate(declaration)",
    async run(ctx) {
      /** @type {Array<[string, Record<string, unknown>, string, string]>} */
      const bad = [
        ["a missing tenant id", { tenantId: undefined }, "invalid_template", "tenantId"],
        ["a blank tenant id", { tenantId: "   " }, "invalid_template", "tenantId"],
        ["an empty tenant id", { tenantId: "" }, "invalid_template", "tenantId"],
        ["a slug with capitals and a space", { slug: "Bad Slug" }, "invalid_template", "slug"],
        ["an empty slug", { slug: "" }, "invalid_template", "slug"],
        ["a name without an English text", { name: { fr: "Bonjour" } }, "invalid_template", "name"],
        ["a blank English name", { name: { en: "  " } }, "invalid_template", "name"],
        ["a content without any locale", { content: { locales: {} } }, "nothing_to_publish", "declares no locale"],
        ["a locale with a blank subject", { content: { locales: { en: { subject: "  ", preheader: "", blocks: [] } } } }, "empty_subject", "en"],
        ["a block of an unknown type", { content: { locales: { en: { subject: "S", preheader: "", blocks: [{ id: "x", type: "carousel", visibleIf: null }] } } } }, "invalid_template", "content"],
        ["a variable of an unknown type", { variables: [{ path: "a", type: "colour", required: false }] }, "invalid_template", "variables"],
        ["test data that is not an object", { testData: "none" }, "invalid_template", "testData"],
        ["an unknown category", { category: "no-such-category" }, "unknown_category", "no-such-category"],
      ];
      for (const [label, over, code, field] of bad) {
        const slug = `bad-${label.replace(/[^a-z]+/gi, "-").toLowerCase()}`.slice(0, 40);
        const outcome = await declare(ctx, `declare ${label}`, declaration(slug.replace(/-+$/, ""), over));
        await ctx.verify(`${label} is rejected with ${code}`, [
          check(`the call rejects with the code ${code}`, !outcome.ok && outcome.error?.code === code, outcome.error ?? outcome.result),
          check(`the message names ${field}`, text(outcome.error, "message").includes(field), outcome.error?.message),
        ]);
      }
      const rows = await templateRows(ctx);
      await ctx.verify("none of the refused declarations left a template", [check("no template at all", rows.length === 0, rows.map((entry) => entry.slug))]);
      const explicit = await declare(ctx, "declare with the explicit default tenant", declaration("explicit-default"));
      await ctx.verify("an explicit default tenant id is valid", [check("created", explicit.ok && pick(explicit.result, "outcome") === "created", explicit)]);
    },
  },
];
