import { guarded } from "../../guard.mjs";
import { check, isRow, list, mailing, pick, text } from "../../mailing.mjs";
import { D } from "./sends-kit.mjs";
import { declareTemplates, importSends, minutesAgo, sendOf, testOf } from "./ui-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */
/** @typedef {import("../../mailing.mjs").Row} Row */

const PLAIN = { type: "failed", details: { reason: "provider says no" } };
const TRANSPORT = { type: "failed", details: { reason: "connect ECONNREFUSED 127.0.0.1:25" } };

/**
 * @param {Ctx} ctx The journey
 * @param {string} label What the read is
 * @returns {Promise<unknown>} The banner, null when there is none
 */
async function banner(ctx, label) {
  const answer = await mailing(ctx, label, "GET", "/sends/banner");
  return answer.status === 200 ? answer.body : { status: answer.status };
}

/**
 * @param {string} prefix Import key prefix
 * @param {number} count How many
 * @param {number} minutes How long ago the first one is
 * @param {Row} event The provider event
 * @param {string} domain The recipients' domain
 * @returns {Row[]} The imports
 */
function many(prefix, count, minutes, event, domain) {
  return Array.from({ length: count }, (_, index) => sendOf(`${prefix}-${index}`, "order", `${prefix}${index}@${domain}`, minutesAgo(minutes + index * 0.1), [event]));
}

const replayAction = (/** @type {unknown} */ body) => list(body, "actions").at(1);

/**
 * @param {Ctx} ctx The journey
 * @param {string} slug The template to declare
 * @returns {Promise<void>}
 */
async function prepare(ctx, slug) {
  await declareTemplates(ctx, [{ slug, category: "orders" }]);
}

export const journeys = guarded([
  {
    id: "banner-appears-from-3-provider-failures-and-ignores-what-is-not-the-providers",
    title: "3 provider failures of the last hour raise the banner; 2, old failures, bounces, spam reports and failed tests do not",
    entryPoint: "GET /api/mailing/sends/banner",
    async run(/** @type {Ctx} */ ctx) {
      await prepare(ctx, "order");
      const empty = await banner(ctx, "an empty log");
      await importSends(ctx, "noise", [
        ...many("old", 5, 90, PLAIN, "old.test"),
        ...many("bounce", 5, 20, { type: "bounced" }, "b.test"),
        ...many("spam", 5, 20, { type: "spam" }, "s.test"),
        ...Array.from({ length: 5 }, (_, index) => testOf(`tf-${index}`, "order", `tf${index}@t.test`, minutesAgo(10 + index), [PLAIN])),
        ...many("two", 2, 30, PLAIN, "two.test"),
      ]);
      const two = await banner(ctx, "2 failures among noise");
      await importSends(ctx, "the third failure", many("third", 1, 25, PLAIN, "third.test"));
      const three = await banner(ctx, "3 failures");
      const actions = pick(three, "actions");
      const replay = replayAction(three);
      await ctx.verify("the count boundary is 3, and only provider failures of the hour count", [
        check("an empty log has no banner", !isRow(empty), empty),
        check("2 failures, with 5 old failures, 5 bounces, 5 spam reports and 5 failed tests around: no banner", !isRow(two), two),
        check("the third failure raises it, in the error tone", pick(three, "tone") === "error", three),
        check("title: Sends to the provider are failing", pick(three, "title", "key") === "$dms_mailing.sends.banner.failures_title" && text(three, "title", "params", "provider") !== "", pick(three, "title")),
        check("description counts the 3 failures of the last hour", pick(three, "description", "key") === "$dms_mailing.sends.banner.failures_description" && pick(three, "description", "params", "count", "value") === 3, pick(three, "description")),
        check("two actions: Provider settings, then Send the failures again…", Array.isArray(actions) && actions.length === 2 && pick(actions[0], "to") === "/modules/mailing/settings#provider" && pick(replay, "label") === "$dms_mailing.sends.banner.send_again", actions),
        check("the replay posts to replay-failed with the start of the hour, confirmed with 3", pick(replay, "target", "url") === "/api/mailing/sends/replay-failed" && pick(replay, "target", "method") === "POST" && pick(replay, "confirm", "params", "count") === 3 && text(replay, "target", "body", "since") !== "", replay),
      ]);
    },
  },
  {
    id: "banner-rate-boundary-is-10-percent-of-the-hours-real-sends",
    title: "3 failures of 30 real sends (10%) raise the banner, 3 of 31 (9.7%) do not",
    entryPoint: "GET /api/mailing/sends/banner",
    async run(/** @type {Ctx} */ ctx) {
      await prepare(ctx, "order");
      await importSends(ctx, "3 failures and 27 deliveries", [...many("fail", 3, 20, PLAIN, "f.test"), ...many("ok", 27, 10, D, "ok.test")]);
      const atTen = await banner(ctx, "3 of 30");
      await importSends(ctx, "one more delivery", many("extra", 1, 5, D, "extra.test"));
      const below = await banner(ctx, "3 of 31");
      await ctx.verify("the rate boundary", [
        check("3 of 30 is 10%: the banner shows", pick(atTen, "tone") === "error", atTen),
        check("3 of 31 is 9.7%: no banner", !isRow(below), below),
      ]);
    },
  },
  {
    id: "banner-a-connection-failure-raises-it-alone",
    title: "a single failure of the connection to the provider raises the banner even among many deliveries",
    entryPoint: "GET /api/mailing/sends/banner",
    async run(/** @type {Ctx} */ ctx) {
      await prepare(ctx, "order");
      await importSends(ctx, "99 deliveries", many("ok", 99, 10, D, "ok.test"));
      const before = await banner(ctx, "deliveries only");
      await importSends(ctx, "one connection failure", many("down", 1, 5, TRANSPORT, "down.test"));
      const after = await banner(ctx, "one connection failure");
      await ctx.verify("one connection failure is enough", [
        check("deliveries alone: no banner", !isRow(before), before),
        check("1 connection failure of 100: the banner, counting 1 failure", pick(after, "tone") === "error" && pick(after, "description", "params", "count", "value") === 1, after),
      ]);
    },
  },
  {
    id: "send-the-failures-again-sends-up-to-100-and-leaves-out-the-rest",
    title: "Send the failures again sends the hour's provider failures with the same data, leaves out suppressed addresses, bounces, spam, tests and old failures, and never twice",
    entryPoint: "POST /api/mailing/sends/replay-failed",
    async run(/** @type {Ctx} */ ctx) {
      await prepare(ctx, "order");
      const ids = await importSends(ctx, "mixed problems", [
        sendOf("f1", "order", "f1@one.test", minutesAgo(30), [PLAIN]),
        sendOf("f2", "order", "f2@one.test", minutesAgo(31), [PLAIN]),
        sendOf("f3", "order", "suppressed@one.test", minutesAgo(32), [PLAIN]),
        sendOf("old", "order", "old@one.test", minutesAgo(90), [PLAIN]),
        sendOf("bn", "order", "bn@one.test", minutesAgo(30), [{ type: "bounced" }]),
        sendOf("sp", "order", "sp@one.test", minutesAgo(30), [D, { type: "spam" }]),
        testOf("tf", "order", "tf@one.test", minutesAgo(30), [PLAIN]),
      ]);
      await mailing(ctx, "suppress an address", "POST", "/suppressions", { body: { email: "suppressed@one.test" } });
      const before = await banner(ctx, "before");
      const first = await mailing(ctx, "send the failures again", "POST", "/sends/replay-failed", { body: {} });
      const stage = async (/** @type {number} */ index) => text(pick((await mailing(ctx, "read", "GET", `/sends/${String(ids[index])}`)).body, "send"), "stage");
      const stages = await Promise.all([0, 1, 2, 3, 4, 5, 6].map(stage));
      const mailed = await ctx.mail((message) => message.to.some((address) => address.includes("f2@one.test")));
      const everyone = mailed.messages.flatMap((message) => message.to);
      const second = await mailing(ctx, "send the failures again once more", "POST", "/sends/replay-failed", { body: {} });
      const wider = await mailing(ctx, "send the failures from 2 hours back", "POST", "/sends/replay-failed", { body: { since: new Date(Date.now() - 2 * 3_600_000).toISOString() } });
      await ctx.verify("the failures go again once", [
        check("the confirmation counts the 2 sendable failures and lists the suppressed one as left out", pick(replayAction(before), "confirm", "params", "count") === 2 && list(pick(replayAction(before), "confirm"), "impact")[0]?.count === 1, replayAction(before)),
        check("2 sent, none failed, 1 skipped, with the skipped warning", JSON.stringify([pick(first.body, "count"), pick(first.body, "failed"), pick(first.body, "skipped"), pick(first.body, "warning")]) === JSON.stringify([2, 0, 1, "$dms_mailing.sends.banner.replay_skipped"]), first.body),
        check("the two failures are resolved; the suppressed one, the old one, the bounce, the spam report and the test stay problems", JSON.stringify(stages) === JSON.stringify(["resolved", "resolved", "problem", "problem", "problem", "problem", "problem"]), stages),
        check("the two e-mails reached the sink and nothing went to the others", everyone.some((address) => address.includes("f1@one.test")) && everyone.some((address) => address.includes("f2@one.test")) && !everyone.some((address) => /suppressed|old@|bn@|sp@|tf@/.test(address)), everyone),
        check("run again: nothing is sent twice (0 sent, 1 skipped)", pick(second.body, "count") === 0 && pick(second.body, "skipped") === 1, second.body),
        check("with since 2 hours back the old failure goes too (1 sent)", pick(wider.body, "count") === 1, wider.body),
      ]);
    },
  },
  {
    id: "send-the-failures-again-is-capped-at-100",
    title: "with 101 failures, Send the failures again sends 100 and the confirmation says so; with every failure suppressed only the settings action remains",
    entryPoint: "POST /api/mailing/sends/replay-failed",
    async run(/** @type {Ctx} */ ctx) {
      await prepare(ctx, "order");
      await importSends(ctx, "101 failures", many("cap", 101, 10, PLAIN, "cap.test"));
      const before = await banner(ctx, "101 failures");
      const answer = await mailing(ctx, "send the failures again", "POST", "/sends/replay-failed", { body: {} });
      const after = await banner(ctx, "after");
      await ctx.verify("100 go, one stays", [
        check("the confirmation says the first 100 of the 101 go", pick(replayAction(before), "confirm", "description") === "$dms_mailing.sends.banner.confirm.description_capped" && pick(replayAction(before), "confirm", "params", "count") === 100 && pick(replayAction(before), "confirm", "params", "total") === 101, replayAction(before)),
        check("100 sent, none failed, none skipped, no warning", JSON.stringify([pick(answer.body, "count"), pick(answer.body, "failed"), pick(answer.body, "skipped"), pick(answer.body, "warning")]) === JSON.stringify([100, 0, 0, undefined]), [pick(answer.body, "count"), pick(answer.body, "failed"), pick(answer.body, "skipped")]),
        check("one failure is left, and a connection failure is not among them, so the banner is gone", !isRow(after), after),
      ]);
    },
  },
  {
    id: "banner-offers-no-replay-when-every-failure-is-suppressed",
    title: "when every failure of the hour is to a suppressed address the banner only links to the provider settings",
    entryPoint: "GET /api/mailing/sends/banner",
    async run(/** @type {Ctx} */ ctx) {
      await prepare(ctx, "order");
      await importSends(ctx, "3 failures", many("sup", 3, 10, PLAIN, "sup.test"));
      for (let index = 0; index < 3; index += 1) await mailing(ctx, `suppress ${index}`, "POST", "/suppressions", { body: { email: `sup${index}@sup.test` } });
      const answer = await banner(ctx, "all suppressed");
      const actions = pick(answer, "actions");
      await ctx.verify("only the settings action remains", [
        check("the banner is raised by the 3 failures", pick(answer, "tone") === "error", answer),
        check("a single action, Provider settings", Array.isArray(actions) && actions.length === 1 && pick(actions[0], "label") === "$dms_mailing.sends.banner.settings", actions),
      ]);
    },
  },
]);
