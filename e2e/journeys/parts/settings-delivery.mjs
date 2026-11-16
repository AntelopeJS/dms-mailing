import { check, list, mailing, pick, text } from "../../mailing.mjs";
import { declareLive, paragraph, sendCode } from "./api-kit.mjs";
import { putSettings } from "./settings-basics.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const MISSING = "$dms_mailing.errors.missing_variables";

const footer = { id: "f", type: "footer", text: "Acme Ltd, 1 Main Street", unsubscribeLabel: "Unsubscribe", preferencesLabel: "", visibleIf: null };

/**
 * The Refuse guard, then Send anyway again with the dashboard's own rules.
 *
 * @param {Ctx} ctx The journey
 * @param {{ id: string, slug: string }} order The ordinary template
 * @param {{ id: string, slug: string }} news The marketing template
 * @returns {Promise<void>}
 */
async function refusing(ctx, order, news) {
  const refuse = await putSettings(ctx, "choose Refuse the send", { missingVariables: "refuse" });
  const after = await mailing(ctx, "read the settings", "GET", "/settings");
  await ctx.verify("Refuse the send is stored as the blocking guard", [
    check("HTTP 200", refuse.status === 200, refuse.body),
    check("blockOnMissingVariables true and missingVariables refuse", pick(after.body, "blockOnMissingVariables") === true && pick(after.body, "missingVariables") === "refuse", after.body),
  ]);
  const refusedTo = ctx.email("refused");
  const refused = await sendCode(ctx, "SendTemplate without customer.name under Refuse", order.slug, { to: refusedTo, variables: { order: { id: "A2" } } });
  await ctx.verify("Refuse the send: the call fails and names the variable", [
    check("the call rejects", !refused.ok, refused),
    check("code missing_variables", refused.error?.code === "missing_variables", refused.error),
    check("the message names exactly the missing variable", refused.error?.message === "customer.name", refused.error?.message),
  ]);
  const complete = await sendCode(ctx, "SendTemplate with every variable under Refuse", order.slug, { to: ctx.email("complete"), variables: { order: { id: "A3" }, customer: { name: "Sofie" } } });
  const marketing = await sendCode(ctx, "marketing SendTemplate without the unsubscribe URL under Refuse", news.slug, { to: ctx.email("news-refuse") });
  const withUrl = await sendCode(ctx, "marketing SendTemplate with the unsubscribe URL under Refuse", news.slug, { to: ctx.email("news-url"), variables: { unsubscribeUrl: "https://app.example.com/unsubscribe/abc" } });
  await ctx.verify("Refuse the send: complete calls still go out, a marketing send needs its unsubscribe URL", [
    check("a complete call is sent", complete.ok && text(complete.result, "status") === "sent", complete),
    check("the marketing send without the URL is refused naming unsubscribeUrl", !marketing.ok && marketing.error?.code === "missing_variables" && marketing.error.message === "unsubscribeUrl", marketing.error),
    check("with the URL it is sent", withUrl.ok && text(withUrl.result, "status") === "sent", withUrl),
  ]);

  const testOrdinary = await mailing(ctx, "test send missing an ordinary variable under Refuse", "POST", `/templates/${order.id}/test-send`, { body: { to: [ctx.email("test-ordinary")], data: { order: { id: "T1" } } } });
  const testNews = await mailing(ctx, "test send of the marketing template without the URL under Refuse", "POST", `/templates/${news.id}/test-send`, { body: { to: [ctx.email("test-news")] } });
  await ctx.verify("a test send is refused for an ordinary variable and never waits for the unsubscribe URL", [
    check("the ordinary variable: 422 missing_variables", testOrdinary.status === 422 && testOrdinary.body === MISSING, [testOrdinary.status, testOrdinary.body]),
    check("the unsubscribe URL: the test goes out", testNews.status === 200 && text(list(testNews.body, "results")[0], "status") === "sent", testNews.body),
  ]);

  await putSettings(ctx, "choose Send anyway again", { missingVariables: "send" });
  const realOrder = await mailing(ctx, "real send missing a required variable under Send anyway", "POST", `/templates/${order.id}/send`, { body: { to: [ctx.email("real-order")], data: { order: { id: "R1" } } } });
  const realNews = await mailing(ctx, "real send of the marketing template without its URL under Send anyway", "POST", `/templates/${news.id}/send`, { body: { to: [ctx.email("real-news")], data: {} } });
  const realOk = await mailing(ctx, "real send with everything", "POST", `/templates/${order.id}/send`, { body: { to: [ctx.email("real-ok")], data: { order: { id: "R2" }, customer: { name: "Sofie" } } } });
  const testAnyway = await mailing(ctx, "test send missing a variable under Send anyway", "POST", `/templates/${order.id}/test-send`, { body: { to: [ctx.email("test-anyway")], data: { order: { id: "T2" } } } });
  await ctx.verify("a real send from the dashboard refuses a missing required variable whatever the guard says", [
    check("a missing ordinary variable: 422 missing_variables", realOrder.status === 422 && realOrder.body === MISSING, [realOrder.status, realOrder.body]),
    check("a missing unsubscribe URL: 422 missing_variables", realNews.status === 422 && realNews.body === MISSING, [realNews.status, realNews.body]),
    check("a complete real send goes out", realOk.status === 200 && text(list(realOk.body, "results")[0], "status") === "sent", realOk.body),
    check("under Send anyway a test missing a variable goes out", testAnyway.status === 200, testAnyway.body),
  ]);
  const sink = await ctx.mail(() => false, 1500);
  const refusedMail = sink.messages.filter((message) => [refusedTo, ctx.email("news-refuse"), ctx.email("test-ordinary"), ctx.email("real-order"), ctx.email("real-news")].some((address) => message.to.some((entry) => entry.includes(address))));
  await ctx.verify("nothing went out for any refused call", [check("no message for the five refused recipients", refusedMail.length === 0, refusedMail.map((message) => message.to))]);
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} */
export const deliveryJourneys = [
  {
    id: "the-missing-variables-guard-refuses-or-sends-anyway",
    title: "with Send anyway a call without a required variable goes out with blanks; with Refuse the send it rejects with missing_variables naming the variable and nothing goes out; a real send from the dashboard refuses whatever the guard says; a test send is refused only for ordinary variables, never for the unsubscribe URL",
    entryPoint: "PUT /api/mailing/settings, SendTemplate, POST /api/mailing/templates/:id/{send,test-send}",
    async run(ctx) {
      const order = await declareLive(ctx, "guard-order", {
        locales: { en: { subject: "Order {{order.id}}", blocks: [paragraph("p", "Hello [{{customer.name}}]")] } },
        variables: [{ path: "order.id", type: "string", required: true }, { path: "customer.name", type: "string", required: true }],
      });
      const news = await declareLive(ctx, "guard-news", {
        category: "marketing",
        locales: { en: { subject: "News", blocks: [paragraph("p", "Hello"), footer] } },
        variables: [],
      });
      const settings = await mailing(ctx, "read the settings", "GET", "/settings");
      await ctx.verify("Send anyway is the default", [check("send", pick(settings.body, "missingVariables") === "send", pick(settings.body, "missingVariables"))]);

      const blank = ctx.email("blank");
      const anyway = await sendCode(ctx, "SendTemplate without customer.name under Send anyway", order.slug, { to: blank, variables: { order: { id: "A1" } } });
      const arrived = await ctx.mail((message) => message.to.some((address) => address.includes(blank)));
      await ctx.verify("Send anyway: blanks where the value is missing", [
        check("the call resolves sent", anyway.ok && text(anyway.result, "status") === "sent", anyway),
        check("the e-mail went out with an empty value", arrived.match?.subject === "Order A1" && /Hello \[\s*\]/.test(arrived.match?.text ?? ""), arrived.match?.text),
      ]);

      const marketingAnyway = await sendCode(ctx, "marketing SendTemplate without the unsubscribe URL under Send anyway", news.slug, { to: ctx.email("news-anyway") });
      await ctx.verify("Send anyway: a marketing send without its unsubscribe URL goes out", [check("sent", marketingAnyway.ok && text(marketingAnyway.result, "status") === "sent", marketingAnyway)]);

      await refusing(ctx, order, news);
    },
  },
  {
    id: "the-fallback-locale-picks-the-version-for-a-language-the-template-lacks",
    title: "a send in a language the template has gets that version (a regional code and any case match its language); in one it lacks it gets the workspace fallback locale, else en, else the template's first language, and the log keeps both the language asked and the one used",
    entryPoint: "PUT /api/mailing/settings, SendTemplate, GET /api/mailing/tables/sends/list",
    async run(ctx) {
      const both = await declareLive(ctx, "locale-both", { locales: { en: { subject: "English", blocks: [paragraph("p", "en")] }, fr: { subject: "French copy", blocks: [paragraph("p", "fr")] } }, variables: [] });
      const onlyFr = await declareLive(ctx, "locale-fr-only", { locales: { fr: { subject: "Only French", blocks: [paragraph("p", "fr")] } }, variables: [] });
      /** @type {Array<[string, string, string | undefined, string, string, string]>} */
      const plan = [
        ["en", both.slug, "de", "English", "en", "de"],
        ["en", both.slug, "fr", "French copy", "fr", "fr"],
        ["en", both.slug, "fr-CA", "French copy", "fr", "fr-CA"],
        ["en", both.slug, "FR", "French copy", "fr", "FR"],
        ["en", both.slug, undefined, "English", "en", ""],
        ["fr", both.slug, "de", "French copy", "fr", "de"],
        ["fr", both.slug, "en", "English", "en", "en"],
        ["es", both.slug, "de", "English", "en", "de"],
        ["en", onlyFr.slug, "de", "Only French", "fr", "de"],
      ];
      for (const [fallback, slug, asked, subject, used, requested] of plan) {
        await putSettings(ctx, `set the fallback locale ${fallback}`, { fallbackLocale: fallback });
        const to = ctx.email(`${fallback}-${slug}-${asked ?? "none"}`.replace(/[^a-z0-9-]/gi, ""));
        const sent = await sendCode(ctx, `send ${slug} asking ${asked ?? "nothing"}`, slug, { to, locale: asked, variables: {} });
        const rows = list((await mailing(ctx, "read the send log", "GET", "/tables/sends/list?limit=100")).body, "results");
        const row = rows.find((entry) => text(entry, "_id") === text(sent.result, "sendId"));
        const arrived = await ctx.mail((message) => message.to.some((address) => address.includes(to)));
        await ctx.verify(`fallback ${fallback}, ${slug} asked for ${asked ?? "no language"}: ${used}`, [
          check(`the e-mail subject is ${subject}`, arrived.match?.subject === subject, arrived.match?.subject),
          check(`the log keeps the language used (${used}) and the language asked (${requested || "none"})`, text(row, "locale") === used && text(row, "requestedLocale") === requested, row),
        ]);
      }
    },
  },
];
