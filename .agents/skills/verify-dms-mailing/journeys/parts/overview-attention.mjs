import { guarded } from "../../guard.mjs";
import { asRow, calling, check, list, mailing, pick, TENANT, text } from "../../mailing.mjs";
import { DAY_MS, HOUR_MS, ago, declareTemplates, importSends, metric, sendOf, testOf, windowQuery } from "./ui-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */
/** @typedef {import("../../mailing.mjs").Row} Row */

const D = { type: "delivered" };
const O = { type: "opened" };

/**
 * @param {Ctx} ctx The journey
 * @param {string} query The window query
 * @returns {Promise<Row[]>} The entries of Needs attention
 */
async function attention(ctx, query = windowQuery(30)) {
  return list(await metric(ctx, `/attention${query}`), "items");
}

const idsOf = (/** @type {Row[]} */ items) => items.map((item) => item.id);


/** @param {Ctx} ctx The journey */
async function listsTemplates(ctx) {
      const empty = await attention(ctx);
      await ctx.verify("an empty workspace only lacks a sender", [
        check("the only entry is the missing sender, linking to the sender settings", JSON.stringify(idsOf(empty)) === JSON.stringify(["sender-missing"]) && empty[0]?.to === "/modules/mailing/settings#dms-form-content-section-sender" && empty[0]?.time === "$dms_mailing.attention.sender_missing.action", empty),
      ]);

      await declareTemplates(ctx, [
        { slug: "alpha", name: "Alpha", locales: ["en", "fr"] },
        { slug: "beta", name: "Beta" },
        { slug: "gamma", name: "Gamma", locales: ["en", "fr"] },
        { slug: "delta", name: "Delta", locales: ["en", "fr"] },
      ]);
      const live = await attention(ctx);
      const missing = live.find((item) => item.id === "missing-locales");
      const unused = live.find((item) => item.id === "unused-live");
      await ctx.verify("live templates missing a locale and unused live templates are listed", [
        check("order: missing locales, sender, unused live", JSON.stringify(idsOf(live)) === JSON.stringify(["missing-locales", "sender-missing", "unused-live"]), idsOf(live)),
        check("one live template misses the translation other live templates have; it links to the templates needing attention with its verb", pick(missing, "params", "count", "value") === 1 && pick(missing, "params", "names") === "Beta" && missing?.to === "/modules/mailing/templates?tab=attention" && missing?.time === "$dms_mailing.attention.missing_locales.action", missing),
        check("4 live templates are unused this period; two names then and 2 more", pick(unused, "params", "count", "value") === 4 && pick(unused, "params", "names", "key") === "$dms_mailing.attention.more_names" && pick(unused, "params", "names", "params", "count", "value") === 2 && unused?.time === "$dms_mailing.attention.unused_live.action", unused),
      ]);

}

/** @param {Ctx} ctx The journey */
async function reportsDeliveries(ctx) {
      await importSends(ctx, "a period of tests", [testOf("t1", "alpha", "t@one.test", ago(2), [D]), testOf("t2", "alpha", "u@one.test", ago(3), [D])]);
      const testOnly = (await attention(ctx)).find((item) => item.id === "test-only-window");
      await ctx.verify("a period holding only test sends says so", [
        check("2 test sends excluded, linking to the send log", pick(testOnly, "params", "count", "value") === 2 && testOnly?.to === "/modules/mailing/sends" && testOnly?.time === "$dms_mailing.attention.test_only_window.action", testOnly),
      ]);

      await importSends(ctx, "sends nothing reports on", [sendOf("r1", "alpha", "a@one.test", ago(2)), sendOf("r2", "alpha", "b@one.test", ago(3))]);
      const unreported = await attention(ctx);
      const delivery = unreported.find((item) => item.id === "untracked-delivery");
      await ctx.verify("deliveries nothing reports are called out, and the test-only note goes", [
        check("untracked delivery links to the provider settings with the provider name", delivery?.to === "/modules/mailing/settings#dms-form-content-section-provider" && text(delivery, "params", "provider") !== "" && delivery?.time === "$dms_mailing.attention.untracked_delivery.action", delivery),
        check("the test-only entry is gone once a real send exists", !idsOf(unreported).includes("test-only-window"), idsOf(unreported)),
        check("opens and clicks are not called out while delivery itself is unmeasured", !idsOf(unreported).includes("untracked-rates"), idsOf(unreported)),
        check("the used template leaves the unused list: 3 unused", pick(unreported.find((item) => item.id === "unused-live"), "params", "count", "value") === 3, unreported.find((item) => item.id === "unused-live")),
      ]);

      await importSends(ctx, "a delivery comes back", [sendOf("r3", "alpha", "c@one.test", ago(1), [D])]);
      const rates = await attention(ctx);
      await ctx.verify("opens and clicks that nothing reports are called out once deliveries are reported", [
        check("untracked rates appear and untracked delivery goes", idsOf(rates).includes("untracked-rates") && !idsOf(rates).includes("untracked-delivery"), idsOf(rates)),
        check("untracked rates link to the provider settings", rates.find((item) => item.id === "untracked-rates")?.to === "/modules/mailing/settings#dms-form-content-section-provider", rates),
      ]);
      await importSends(ctx, "an open comes back", [sendOf("r4", "alpha", "d@one.test", ago(1), [D, O])]);
      const opened = await attention(ctx);
      await ctx.verify("a reported open ends the note", [check("untracked rates is gone", !idsOf(opened).includes("untracked-rates"), idsOf(opened))]);

}

/**
 * @param {Ctx} ctx The journey
 * @returns {Promise<void>}
 */
async function listsProblems(ctx) {
      const problemIds = await importSends(ctx, "problems", [
        sendOf("p1", "alpha", "e@one.test", ago(1), [{ type: "bounced", details: { reason: "550 5.1.1 Mailbox does not exist" } }]),
        sendOf("p2", "alpha", "f@one.test", ago(1), [{ type: "failed", details: { reason: "provider says no" } }]),
        sendOf("p3", "alpha", "g@one.test", ago(1), [{ type: "failed", details: { reason: "provider says no" } }]),
        sendOf("p4", "alpha", "h@one.test", ago(1), [D, { type: "spam" }]),
        testOf("p5", "alpha", "i@one.test", ago(1), [{ type: "failed" }]),
      ]);
      const problems = (await attention(ctx))[0];
      await ctx.verify("sends with a problem lead the list and link to the Problems tab", [
        check("first entry: 4 sends with a problem (test sends left out), 1 bounce, 2 failures, 1 spam", problems?.id === "problem-sends" && pick(problems, "params", "count", "value") === 4 && pick(problems, "params", "bounced") === 1 && pick(problems, "params", "failed") === 2 && pick(problems, "params", "spam") === 1, problems),
        check("it links to the Problems tab with the verb Review problems", problems?.to === "/modules/mailing/sends?view=problems" && problems?.time === "$dms_mailing.attention.problem_sends.action", problems),
        check("its details count each kind", JSON.stringify(problems?.meta) === JSON.stringify([
          { key: "$dms_mailing.attention.problem_sends.parts.bounced", params: { count: { type: "count", value: 1 } } },
          { key: "$dms_mailing.attention.problem_sends.parts.failed", params: { count: { type: "count", value: 2 } } },
          { key: "$dms_mailing.attention.problem_sends.parts.spam", params: { count: { type: "count", value: 1 } } },
        ]), problems?.meta),
      ]);

      const again = await mailing(ctx, "send the failure again", "POST", `/sends/${problemIds[1]}/replay`, { body: {} });
      const afterReplay = (await attention(ctx))[0];
      await ctx.verify("a send again resolves its problem", [
        check("the replay is accepted and sent", again.status === 200 && pick(again.body, "status") === "sent", again.body),
        check("the failure leaves the list: 3 sends with a problem, 1 failure", pick(afterReplay, "params", "count", "value") === 3 && pick(afterReplay, "params", "failed") === 1, afterReplay),
      ]);

      const sender = await calling(ctx, "declare the sender", "sender", [{ tenantId: TENANT, email: "hello@one.test", name: "Hello" }]);
      const withSender = await attention(ctx);
      await ctx.verify("a sender address removes its entry", [
        check("the sender is declared", sender.ok, sender.error ?? sender.result),
        check("sender-missing is gone", !idsOf(withSender).includes("sender-missing"), idsOf(withSender)),
      ]);

}

/** @param {Ctx} ctx The journey */
async function listsWindows(ctx) {
      const withSender = await attention(ctx);
      const compared = idsOf(await attention(ctx, windowQuery(30, "previous-year")));
      const uncompared = idsOf(await attention(ctx, windowQuery(30, "none")));
      await ctx.verify("the list never compares", [
        check("the same entries whatever the comparison", JSON.stringify(compared) === JSON.stringify(idsOf(withSender)) && JSON.stringify(uncompared) === JSON.stringify(idsOf(withSender)), [compared, uncompared]),
      ]);

      const before = new Date(Date.now() - HOUR_MS);
      const early = await attention(ctx, `?from=${encodeURIComponent(new Date(before.getTime() - 30 * DAY_MS).toISOString())}&to=${encodeURIComponent(before.toISOString())}`);
      await ctx.verify("a template published after the window closed is not called unused", [
        check("no unused-live entry for a window that closed before the templates were published", !idsOf(early).includes("unused-live"), idsOf(early)),
      ]);

      const draft = await ctx.api("create a draft", { method: "POST", path: "/api/mailing/tables/templates/new", body: { slug: "fresh-draft", name: "Fresh draft", category: "orders" } });
      const withDraft = await attention(ctx);
      await ctx.verify("a draft just made is not left untouched", [
        check("the draft exists", draft.status === 200, draft.body),
        check("no stale-drafts entry", !idsOf(withDraft).includes("stale-drafts"), idsOf(withDraft)),
      ]);
}

export const journeys = guarded([
  {
    id: "needs-attention-lists-what-to-act-on",
    title: "Needs attention lists sends with a problem, missing locales, a missing sender, unreported deliveries, opens and clicks, a test-only period and unused live templates, each with its verb",
    entryPoint: "GET /api/mailing/metrics/attention",
    async run(/** @type {Ctx} */ ctx) {
      await listsTemplates(ctx);
      await reportsDeliveries(ctx);
      await listsProblems(ctx);
      await listsWindows(ctx);
    },
  },
  {
    id: "setup-facts-follow-the-workspace",
    title: "the setup checklist reads a connected provider, a sender, a live template and a test send",
    entryPoint: "GET /api/mailing/metrics/setup, /modules/mailing",
    async run(/** @type {Ctx} */ ctx) {
      const facts = async () => asRow(await metric(ctx, "/setup"));
      const empty = await facts();
      await ctx.verify("a new workspace has a provider and nothing else", [
        check("provider connected, no sender, no live template, no test send", JSON.stringify([empty.isProviderConnected, empty.isSenderSet, empty.liveTemplateCount, empty.hasTestSend]) === JSON.stringify([true, false, 0, false]), empty),
      ]);
      const draft = await ctx.api("create a draft", { method: "POST", path: "/api/mailing/tables/templates/new", body: { slug: "only-draft", name: "Only draft", category: "orders" } });
      const withDraft = await facts();
      await ctx.verify("a draft is not a live template", [
        check("the draft exists", draft.status === 200, draft.body),
        check("liveTemplateCount stays 0", withDraft.liveTemplateCount === 0, withDraft),
      ]);
      await declareTemplates(ctx, [{ slug: "one" }, { slug: "two" }]);
      const published = await facts();
      await calling(ctx, "declare the sender", "sender", [{ tenantId: TENANT, email: "hello@one.test" }]);
      const withSender = await facts();
      const id = String(pick(draft.body, "_id"));
      const test = await mailing(ctx, "send a test", "POST", `/templates/${id}/test-send`, { body: { to: [ctx.email("tester")] } });
      const afterTest = await facts();
      await ctx.verify("each step turns done when its fact holds", [
        check("two live templates", published.liveTemplateCount === 2, published),
        check("the sender is set", withSender.isSenderSet === true, withSender),
        check("the test send is accepted", test.status === 200, test.body),
        check("a test send is found", afterTest.hasTestSend === true, afterTest),
      ]);
    },
  },
]);
