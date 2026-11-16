import { calling, check, mailing, pick, text, texts } from "../../mailing.mjs";
import { sendDetail } from "./api-kit.mjs";
import { table } from "./templates-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const TENANT = "default";
const DATA = { customer: { name: "Sofie" }, order: { total: { value: 4800, currency: "EUR" } } };

/**
 * @param {Ctx} ctx The journey
 * @param {string} slug The template
 * @param {Record<string, unknown>} more The fields of the declaration besides the tenant, the slug and the name
 * @returns {Promise<{ id: string, result: unknown }>} The declaration's outcome
 */
async function declared(ctx, slug, more) {
  const done = await calling(ctx, `declare ${slug}`, "template", [{ tenantId: TENANT, slug, name: { en: `Name ${slug}` }, ...more }]);
  await ctx.verify(`${slug} is declared`, [check("created as version 1", done.ok && pick(done.result, "outcome") === "created" && pick(done.result, "version") === 1, done.result ?? done.error)], { critical: true });
  return { id: text(done.result, "templateId"), result: done.result };
}

/**
 * @param {unknown} blocks The blocks an answer holds
 * @returns {string} Their type, id, text and alignment, whatever the order of their keys
 */
function blockSummary(blocks) {
  return JSON.stringify((Array.isArray(blocks) ? blocks : []).map((block) => [pick(block, "type"), pick(block, "id"), pick(block, "text"), pick(block, "align")]));
}

const LOCALES = {
  en: { subject: "Hi {{customer.name}}", preheader: "Pre {{customer.name}}", blocks: [{ id: "p", type: "paragraph", text: "Hello {{customer.name}}", align: "left", visibleIf: null }] },
  fr: { subject: "Salut {{customer.name}}", preheader: "Avant", blocks: [{ id: "p", type: "paragraph", text: "Bonjour {{customer.name}}", align: "left", visibleIf: null }] },
};

/**
 * @param {Ctx} ctx The journey
 * @param {string[]} ids The send ids of the import: full, test, plain
 * @returns {Promise<void>}
 */
async function importedFields(ctx, ids) {
  const full = await sendDetail(ctx, ids[0] ?? "");
  const test = await sendDetail(ctx, ids[1] ?? "");
  const plain = await sendDetail(ctx, ids[2] ?? "");
  await ctx.verify("every field of the import is read back", [
    check("the recipient address and name", text(full.send, "recipientEmail") === "full@imp.test" && text(full.send, "recipientName") === "Imp Ort", full.send),
    check("the locale given", text(full.send, "locale") === "fr", full.send),
    check("the provider and its message id", text(full.send, "provider") === "postmark" && text(full.send, "providerMessageId") === "pm-123", full.send),
    check("the source given", text(full.send, "source") === "billing-sync", full.send),
    check("the variables", text(full.send, "json_variables") === '{"order":{"n":7}}', full.send),
    check("the details of the event", text(full.events[0], "json_details") === '{"eventId":"e1"}', full.events),
    check("a real send is not a test", full.send?.isTest === false, full.send?.isTest),
    check("the published version 2, not the draft or the first", full.send?.templateVersion === 2 && test.send?.templateVersion === 2 && plain.send?.templateVersion === 2, [full.send?.templateVersion, test.send?.templateVersion, plain.send?.templateVersion]),
    check("the test flag", test.send?.isTest === true, test.send?.isTest),
    check("the defaults: source import, workspace locale", text(plain.send, "source") === "import" && text(plain.send, "locale") === "en", plain.send),
  ]);
}

export const journeys = [
  {
    id: "a-declared-template-keeps-every-field-it-was-given",
    title: "a declared template reads back its names, category, locales with subject, preheader and blocks, variables and test data, a test send renders the declared test data, and a declaration without category, variables or test data has none",
    entryPoint: "DeclareTemplate, GET /api/mailing/templates/:id/content, POST /api/mailing/templates/:id/test-send",
    async run(/** @type {Ctx} */ ctx) {
      const variables = [
        { path: "customer.name", type: "string", required: true },
        { path: "order.total", type: "money", required: false },
      ];
      const full = await declared(ctx, "full-fields", { name: { en: "Full fields", fr: "Tous les champs" }, category: "billing", content: { locales: LOCALES }, variables, testData: DATA });
      const read = await mailing(ctx, "read the declared template", "GET", `/templates/${full.id}/content`);
      const row = await table(ctx, "its row", "GET", `/get?id=${full.id}`);
      await ctx.verify("every field is read back", [
        check("the category", text(row.body, "category") === "billing" && text(read.body, "template", "category") === "billing", [row.body, pick(read.body, "template")]),
        check("the English name", text(row.body, "name") === "Full fields", row.body),
        check("the locales", Object.keys(pick(read.body, "content", "locales") ?? {}).sort().join() === "en,fr", pick(read.body, "content")),
        check("the English subject, preheader and block", pick(read.body, "content", "locales", "en", "subject") === LOCALES.en.subject && pick(read.body, "content", "locales", "en", "preheader") === LOCALES.en.preheader && blockSummary(pick(read.body, "content", "locales", "en", "blocks")) === blockSummary(LOCALES.en.blocks), pick(read.body, "content", "locales", "en")),
        check("the French subject, preheader and block", pick(read.body, "content", "locales", "fr", "subject") === LOCALES.fr.subject && pick(read.body, "content", "locales", "fr", "preheader") === LOCALES.fr.preheader && blockSummary(pick(read.body, "content", "locales", "fr", "blocks")) === blockSummary(LOCALES.fr.blocks), pick(read.body, "content", "locales", "fr")),
        check("the variables, with their types and required flags", JSON.stringify(pick(read.body, "variables")) === JSON.stringify(variables), pick(read.body, "variables")),
        check("the test data", JSON.stringify(pick(read.body, "testData")) === JSON.stringify(DATA), pick(read.body, "testData")),
        check("published as version 1 with no draft", pick(read.body, "version") === 1 && pick(read.body, "hasDraft") === false, [pick(read.body, "version"), pick(read.body, "hasDraft")]),
      ]);
      const preview = await mailing(ctx, "preview with no data", "POST", `/templates/${full.id}/preview`, { body: { locale: "en" } });
      await ctx.verify("the preview with no data renders the declared test data", [
        check("the subject is Hi Sofie", text(preview.body, "subject") === "Hi Sofie", preview.body),
        check("the body says Hello Sofie", text(preview.body, "html").includes("Hello Sofie"), text(preview.body, "html").slice(0, 200)),
        check("nothing is missing", JSON.stringify(pick(preview.body, "missing")) === "[]", pick(preview.body, "missing")),
      ]);
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto(`/modules/mailing/templates/${full.id}`);
      await tab.visible({ role: "button", name: "Test", exact: true });
      await tab.press("t");
      await tab.click({ role: "button", name: "Send 1 test" });
      const mail = await ctx.mail((message) => message.subject.startsWith("[TEST]"), 30_000);
      await ctx.verify("the editor's test dialog sends the declared test data set", [
        check("the subject is [TEST] Hi Sofie", mail.match?.subject === "[TEST] Hi Sofie", mail.match?.subject),
        check("the body says Hello Sofie", /Hello Sofie/.test(mail.match?.text ?? ""), mail.match?.text),
      ]);
      const bare = await declared(ctx, "bare-fields", { content: { locales: { en: { subject: "Bare", preheader: "", blocks: [] } } } });
      const bareRead = await mailing(ctx, "read the bare template", "GET", `/templates/${bare.id}/content`);
      const bareRow = await table(ctx, "its row", "GET", `/get?id=${bare.id}`);
      await ctx.verify("a declaration without category, variables or test data has none", [
        check("no category in the table row", !text(bareRow.body, "category"), bareRow.body),
        check("no category in the editor's read", !text(bareRead.body, "template", "category"), pick(bareRead.body, "template")),
        check("no variables", JSON.stringify(pick(bareRead.body, "variables")) === "[]", pick(bareRead.body, "variables")),
        check("no test data", JSON.stringify(pick(bareRead.body, "testData")) === "{}", pick(bareRead.body, "testData")),
      ]);
    },
  },
  {
    id: "imported-sends-record-every-field-and-the-published-version",
    title: "an imported send reads back its recipient and name, locale, variables, provider, provider message id, source and test flag, and records the template's published version, not its draft or the first",
    entryPoint: "ImportSends, GET /api/mailing/sends/:id",
    async run(/** @type {Ctx} */ ctx) {
      const template = await declared(ctx, "versioned", { content: { locales: { en: { subject: "V1", preheader: "", blocks: [] }, fr: { subject: "V1 fr", preheader: "", blocks: [] } } } });
      const body = (/** @type {string} */ subject) => ({ content: { locales: { en: { subject, preheader: "", blocks: [] }, fr: { subject: `${subject} fr`, preheader: "", blocks: [] } } } });
      await mailing(ctx, "edit to v2", "POST", `/templates/${template.id}/content`, { body: body("V2") });
      const published = await mailing(ctx, "publish v2", "POST", `/templates/${template.id}/publish`, { body: {} });
      await mailing(ctx, "leave a draft pending", "POST", `/templates/${template.id}/content`, { body: body("V3 draft") });
      const when = { $date: new Date(Date.now() - 5 * 3_600_000).toISOString() };
      const entry = (/** @type {string} */ key, /** @type {Record<string, unknown>} */ more) => ({ importId: key, templateSlug: "versioned", to: { email: `${key}@imp.test`, name: "Imp Ort" }, sentAt: when, ...more });
      const done = await calling(ctx, "import", "import", [
        {
          tenantId: TENANT,
          sends: [
            entry("full", { locale: "fr", variables: { order: { n: 7 } }, provider: "postmark", providerMessageId: "pm-123", source: "billing-sync", isTest: false, events: [{ type: "delivered", at: when, details: { eventId: "e1" } }] }),
            entry("test", { isTest: true }),
            entry("plain", {}),
          ],
        },
      ]);
      const ids = texts(done.result, "sendIds");
      await ctx.verify("the import is accepted", [check("3 imported", done.ok && pick(done.result, "imported") === 3, done.result ?? done.error), check("v2 is published, v3 only a draft", published.status === 200 && pick(published.body, "version") === 2, published.body)], { critical: true });
      await importedFields(ctx, ids);
    },
  },
];
