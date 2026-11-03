import { guarded } from "../../guard.mjs";
import { calling, check, mailing, pick, text, TENANT } from "../../mailing.mjs";
import { wait } from "./browser-kit.mjs";
import { openSends, WHO } from "./sends-kit.mjs";
import { ago, declareTemplates, importSends, metric, sendOf, testOf, windowQuery } from "./ui-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const FAILURE = { type: "failed", details: { reason: "provider says no" } };

/**
 * @param {Ctx} ctx The journey
 * @param {string} slug The template
 * @param {boolean} live Whether to publish it
 * @returns {Promise<string>} The template id
 */
async function templateOf(ctx, slug, live) {
  if (live) {
    await declareTemplates(ctx, [{ slug }]);
    const found = await ctx.api("find the template", { method: "GET", path: "/api/mailing/tables/templates/list?limit=100" });
    const rows = pick(found.body, "results");
    return text((Array.isArray(rows) ? rows : []).find((row) => pick(row, "slug") === slug), "_id");
  }
  const created = await ctx.api("create a draft", { method: "POST", path: "/api/mailing/tables/templates/new", body: { slug, name: slug, category: "orders" } });
  return text(created.body, "_id");
}

export const journeys = guarded([
  {
    id: "test-send-and-real-send-rules",
    title: "a test send is tagged [TEST] and left out of the figures; a real send needs a live template and counts; both take 1 to 5 valid addresses",
    entryPoint: "POST /api/mailing/templates/:id/test-send, POST /api/mailing/templates/:id/send",
    async run(/** @type {Ctx} */ ctx) {
      const live = await templateOf(ctx, "order", true);
      const draft = await templateOf(ctx, "only-draft", false);
      const addresses = (/** @type {number} */ count) => Array.from({ length: count }, (_, index) => ctx.email(`r${index}`));
      const send = (/** @type {string} */ kind, /** @type {string} */ id, /** @type {unknown} */ to) => mailing(ctx, `${kind} ${JSON.stringify(to).slice(0, 40)}`, "POST", `/templates/${id}/${kind}`, { body: { to } });
      const five = await send("test-send", draft, addresses(5));
      const six = await send("test-send", draft, addresses(6));
      const none = await send("test-send", draft, []);
      const bad = await send("test-send", draft, ["not-an-address"]);
      const tagged = await ctx.mail((message) => message.to.some((address) => address.includes("r4+")));
      await ctx.verify("a test send takes 1 to 5 valid addresses", [
        check("5 addresses: 200, one result each", five.status === 200 && Array.isArray(pick(five.body, "results")) && /** @type {unknown[]} */ (pick(five.body, "results")).length === 5, five.body),
        check("6 addresses: refused with the invalid recipient message", six.status >= 400 && six.status < 500 && JSON.stringify(six.body).includes("invalid_recipient"), [six.status, six.body]),
        check("no address: refused", none.status >= 400 && none.status < 500, [none.status, none.body]),
        check("an invalid address: refused with the invalid recipient message", bad.status >= 400 && bad.status < 500 && JSON.stringify(bad.body).includes("invalid_recipient"), [bad.status, bad.body]),
        check("the subject of the e-mail starts with [TEST]", tagged.match?.subject.startsWith("[TEST]") === true, tagged.match?.subject),
      ]);
      const refusedDraft = await send("send", draft, addresses(1));
      const real = await send("send", live, addresses(1));
      const realSix = await send("send", live, addresses(6));
      const realMail = await ctx.mail((message) => message.to.some((address) => address.includes("r0+")) && !message.subject.startsWith("[TEST]"));
      const results = pick(real.body, "results");
      const detail = await mailing(ctx, "read the real send", "GET", `/sends/${text(Array.isArray(results) ? results[0] : undefined, "sendId")}`);
      await ctx.verify("a real send needs a live template and up to 5 addresses", [
        check("a draft refuses it: 422 template_not_live", refusedDraft.status === 422 && JSON.stringify(refusedDraft.body).includes("template_not_live"), refusedDraft.body),
        check("a live template sends: 200", real.status === 200, real.body),
        check("6 addresses are refused", realSix.status >= 400 && realSix.status < 500, [realSix.status, realSix.body]),
        check("the e-mail has no [TEST] tag", realMail.match !== undefined, realMail.messages.map((message) => message.subject)),
        check("it is stored as a real send from the manual source", pick(detail.body, "send", "isTest") === false && text(detail.body, "send", "source") === "dms-mailing:manual", pick(detail.body, "send")),
      ]);
      const sends = pick(await metric(ctx, `/kpi/sends${windowQuery(30, "none")}`), "value");
      await ctx.verify("only the real send counts", [check("Sends is 1: the 5 test sends are left out, the real one counts", sends === 1, sends)]);
    },
  },
  {
    id: "sends-badge-counts-real-problems-of-the-last-24-hours",
    title: "the Sends badge in the sidebar counts the real sends with a problem in the last 24 hours",
    entryPoint: "/modules/mailing/sends (sidebar)",
    async run(/** @type {Ctx} */ ctx) {
      await declareTemplates(ctx, [{ slug: "order", category: "orders" }]);
      const ids = await importSends(ctx, "problems of different ages", [
        sendOf("in", "order", "in@one.test", ago(0, 23), [{ type: "bounced" }]),
        sendOf("out", "order", "out@one.test", ago(0, 25), [{ type: "bounced" }]),
        testOf("test", "order", "test@one.test", ago(0, 2), [FAILURE]),
        sendOf("spam", "order", "spam@one.test", ago(0, 5), [{ type: "delivered" }, { type: "spam" }]),
        sendOf("resolved", "order", "resolved@one.test", ago(0, 3), [FAILURE]),
        sendOf("fine", "order", "fine@one.test", ago(0, 3), [{ type: "delivered" }]),
      ]);
      const replay = await mailing(ctx, "send the failure again", "POST", `/sends/${String(ids[4])}/replay`, { body: {} });
      const tab = await openSends(ctx);
      await wait(tab, 2000);
      const badge = await tab.visible({ role: "link", name: "Sends 2", exact: true }, { timeoutMs: 15_000 });
      await ctx.verify("only open real problems of the last 24 hours count", [
        check("the failure was sent again", replay.status === 200, replay.body),
        check("the link reads Sends 2: the 23 hour bounce and the spam report, not the 25 hour one, the test, the resolved failure or the delivered send", badge.pass, WHO.test),
      ]);
      await calling(ctx, "one more problem", "import", [{ tenantId: TENANT, sends: [sendOf("more", "order", "more@one.test", ago(0, 1), [FAILURE])] }]);
      await tab.reload();
      const more = await tab.visible({ role: "link", name: "Sends 3", exact: true }, { timeoutMs: 15_000 });
      await ctx.verify("a new problem moves the badge", [check("Sends 3", more.pass, more.detail)]);
    },
  },
]);
