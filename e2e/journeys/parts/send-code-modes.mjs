import { check, list, mailing, pick, text } from "../../mailing.mjs";
import { declareLive, paragraph, partsOf, sendCode, sendDetail, subjectOfHead } from "./api-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

/**
 * @param {Ctx} ctx The journey
 * @param {string} to The recipient
 * @returns {Promise<string>} The subject of the message the sink received for it
 */
async function subjectFor(ctx, to) {
  const arrived = await ctx.mail((message) => message.to.some((address) => address.includes(to)));
  return arrived.match ? subjectOfHead(partsOf(arrived.match).head) : "";
}

const content = (/** @type {string} */ subject) => ({ locales: { en: { subject, preheader: "", blocks: [paragraph("p", `Body of ${subject}`)] } } });

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} */
export const modeJourneys = [
  {
    id: "test-sends-use-the-draft-and-content-overrides-change-nothing",
    title: "a live send uses the published version and records its number; isTest prefixes the subject with [TEST] , uses the draft when there is one, is logged as a test and left out of the figures; content sends an alternate body without saving or publishing; publishing moves later sends to version 2",
    entryPoint: "SendTemplate(slug, { isTest, content })",
    async run(ctx) {
      const template = await declareLive(ctx, "mode-order", { locales: { en: { subject: "Published", blocks: [paragraph("p", "Published body")] } }, variables: [] });
      const tests = { published: ctx.email("test-published"), draft: ctx.email("test-draft"), live: ctx.email("live"), alt: ctx.email("alt"), after: ctx.email("after"), v2: ctx.email("v2") };

      await sendCode(ctx, "test send before any draft", template.slug, { to: tests.published, isTest: true });
      const noDraft = await subjectFor(ctx, tests.published);
      const saved = await mailing(ctx, "save a draft", "POST", `/templates/${template.id}/content`, { body: { content: content("Draft subject") } });
      await sendCode(ctx, "test send with a draft", template.slug, { to: tests.draft, isTest: true });
      const withDraft = await subjectFor(ctx, tests.draft);
      const live = await sendCode(ctx, "live send with a draft pending", template.slug, { to: tests.live });
      const liveSubject = await subjectFor(ctx, tests.live);
      await ctx.verify("tests and live sends read different versions", [
        check("a test without a draft uses the published subject, prefixed", noDraft === "[TEST] Published", noDraft),
        check("the draft was saved", saved.status === 200, saved.body),
        check("a test with a draft uses the draft, prefixed", withDraft === "[TEST] Draft subject", withDraft),
        check("a live send keeps the published version and no prefix", liveSubject === "Published", liveSubject),
      ]);
      const rows = list((await mailing(ctx, "list the sends", "GET", "/tables/sends/list?limit=50")).body, "results");
      const rowOf = (/** @type {string} */ address) => rows.find((row) => text(row, "recipientEmail") === address);
      const stats = await mailing(ctx, "read the figures", "GET", "/sends/stats");
      const liveDetail = await sendDetail(ctx, text(live.result, "sendId"));
      await ctx.verify("a test is marked and left out of the production figures", [
        check("the test rows are tests", rowOf(tests.published)?.isTest === true && rowOf(tests.draft)?.isTest === true, [rowOf(tests.published)?.isTest, rowOf(tests.draft)?.isTest]),
        check("the live row is not", rowOf(tests.live)?.isTest === false, rowOf(tests.live)?.isTest),
        check("the figures count one send and two tests", pick(stats.body, "sends") === 1 && pick(stats.body, "tests") === 2, [pick(stats.body, "sends"), pick(stats.body, "tests")]),
        check("the live send records version 1", liveDetail.send?.templateVersion === 1, liveDetail.send?.templateVersion),
        check("a test with a draft records the draft marker, version 0", rowOf(tests.draft)?.templateVersion === 0, rowOf(tests.draft)?.templateVersion),
      ]);

      await sendCode(ctx, "live send with an alternate body", template.slug, { to: tests.alt, content: content("Alt subject") });
      const alt = await subjectFor(ctx, tests.alt);
      await sendCode(ctx, "live send afterwards", template.slug, { to: tests.after });
      const after = await subjectFor(ctx, tests.after);
      const listing = list((await mailing(ctx, "list the templates", "GET", "/tables/templates/list?limit=10")).body, "results")[0];
      await ctx.verify("content overrides the body of one send and saves nothing", [
        check("the alternate subject is used", alt === "Alt subject", alt),
        check("the next send is the published version again", after === "Published", after),
        check("no version was published", pick(listing, "publishedVersion") === 1, listing),
        check("the draft is still pending", pick(listing, "isDraftPending") === true, listing),
      ]);
      const published = await mailing(ctx, "publish the draft", "POST", `/templates/${template.id}/publish`, { body: {} });
      const v2 = await sendCode(ctx, "live send after publishing", template.slug, { to: tests.v2 });
      const v2Subject = await subjectFor(ctx, tests.v2);
      const v2Detail = await sendDetail(ctx, text(v2.result, "sendId"));
      await ctx.verify("publishing moves later sends to version 2 and earlier sends stay on 1", [
        check("published", published.status === 200, published.body),
        check("the new subject", v2Subject === "Draft subject", v2Subject),
        check("version 2 is recorded", v2Detail.send?.templateVersion === 2, v2Detail.send?.templateVersion),
        check("the earlier live send still says version 1", (await sendDetail(ctx, text(live.result, "sendId"))).send?.templateVersion === 1, "changed"),
      ]);
    },
  },
  {
    id: "the-send-log-shows-the-language-asked-when-another-was-sent",
    title: "a send that asked for a language the template lacks is logged with the language sent and, in the Sends page, the line DE asked under it; a send that got its language shows no such line",
    entryPoint: "SendTemplate(slug, { locale }), /modules/mailing/sends",
    async run(ctx) {
      const template = await declareLive(ctx, "asked-order", { locales: { en: { subject: "English", blocks: [paragraph("p", "en")] }, fr: { subject: "French", blocks: [paragraph("p", "fr")] } }, variables: [] });
      const asked = ctx.email("asked-de");
      const got = ctx.email("got-fr");
      const fallback = await sendCode(ctx, "send asking for German", template.slug, { to: asked, locale: "de", variables: {} });
      const exact = await sendCode(ctx, "send asking for French", template.slug, { to: got, locale: "fr", variables: {} });
      const rows = list((await mailing(ctx, "list the sends", "GET", "/tables/sends/list?limit=20")).body, "results");
      const askedRow = rows.find((row) => text(row, "_id") === text(fallback.result, "sendId"));
      const gotRow = rows.find((row) => text(row, "_id") === text(exact.result, "sendId"));
      await ctx.verify("the log row keeps both languages", [
        check("English sent, German asked", text(askedRow, "locale") === "en" && text(askedRow, "requestedLocale") === "de" && text(askedRow, "localeLabel") === "EN", askedRow),
        check("the fallback line says DE asked, in the warning tone", text(askedRow, "localeFallback", "text", "key") === "$dms_mailing.sends.locale_fallback" && text(askedRow, "localeFallback", "text", "params", "requested") === "DE" && text(askedRow, "localeFallback", "tone") === "warning", askedRow?.localeFallback),
        check("French asked and sent: no fallback line", gotRow?.localeFallback === null && text(gotRow, "localeLabel") === "FR", gotRow),
      ]);
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto("/modules/mailing/sends");
      const row = (/** @type {string} */ address) => ({ role: "row", name: new RegExp(address.replace(/[+.]/g, "\\$&")) });
      await ctx.verify("the Sends page writes DE asked on the fallback row only", [
        tab.visible({ role: "row", name: new RegExp(`${asked.replace(/[+.]/g, "\\$&")}.*DE asked`) }),
        tab.visible(row(got)),
        tab.visible({ role: "row", name: new RegExp(`${got.replace(/[+.]/g, "\\$&")}.*[A-Z]{2} asked`) }, { hidden: true, timeoutMs: 3000 }),
      ]);
    },
  },
];
