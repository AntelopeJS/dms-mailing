import { guarded } from "../../guard.mjs";
import { check, mailing, pick, text } from "../../mailing.mjs";
import { D, O } from "./sends-kit.mjs";
import { ago, declareTemplates, importSends, sendOf, testOf } from "./ui-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const FAILURE = { type: "failed", details: { reason: "provider says no" } };

/**
 * @param {Ctx} ctx The journey
 * @param {string} id A send id
 * @returns {Promise<{ stage: string, replayedBy: string, replayOf: string, source: string, isTest: boolean, status: string }>} The stored send
 */
async function stored(ctx, id) {
  const detail = await mailing(ctx, `read send ${id.slice(0, 6)}`, "GET", `/sends/${id}`);
  const send = pick(detail.body, "send");
  return {
    stage: text(send, "stage"),
    replayedBy: text(send, "replayedBy"),
    replayOf: text(send, "replayOf"),
    source: text(send, "source"),
    isTest: pick(send, "isTest") === true,
    status: text(send, "status"),
  };
}

export const journeys = guarded([
  {
    id: "send-again-rules-by-status",
    title: "a spam report is never answered, a permanent bounce needs another address, a temporary bounce or a failure goes again, the original is resolved and linked",
    entryPoint: "POST /api/mailing/sends/:id/replay",
    async run(/** @type {Ctx} */ ctx) {
      await declareTemplates(ctx, [{ slug: "order", category: "orders" }]);
      const ids = await importSends(ctx, "problems", [
        sendOf("sp", "order", "spam@one.test", ago(0, 3), [D, { type: "spam" }]),
        sendOf("hb", "order", "hard@one.test", ago(0, 3), [{ type: "bounced", details: { reason: "550 5.1.1 Mailbox does not exist" } }]),
        sendOf("sb", "order", "soft@one.test", ago(0, 3), [{ type: "bounced", details: { reason: "452 4.2.2 mailbox full", bounceType: "soft" } }]),
        sendOf("f1", "order", "failed@one.test", ago(0, 3), [FAILURE]),
        sendOf("dl", "order", "ok@one.test", ago(0, 3), [D, O]),
        testOf("tf", "order", "testfail@one.test", ago(0, 3), [FAILURE]),
      ]);
      const [spam, hard, soft, failed, delivered, testFailure] = ids;
      const replay = (/** @type {string} */ label, /** @type {string | undefined} */ id, /** @type {unknown} */ body) => mailing(ctx, label, "POST", `/sends/${String(id)}/replay`, { body });
      const afterSpam = await replay("replay a spam report", spam, {});
      const sameAddress = await replay("replay a permanent bounce to the same address", hard, {});
      const echoed = await replay("replay a permanent bounce to the same address typed again", hard, { to: "HARD@one.test" });
      await ctx.verify("a spam report and a permanent bounce refuse the same address", [
        check("spam: 409 no_replay_after_spam", afterSpam.status === 409 && JSON.stringify(afterSpam.body).includes("no_replay_after_spam"), afterSpam.body),
        check("permanent bounce without an address: 409 replay_needs_new_address", sameAddress.status === 409 && JSON.stringify(sameAddress.body).includes("replay_needs_new_address"), sameAddress.body),
        check("permanent bounce to the same address in other letters: 409", echoed.status === 409 && JSON.stringify(echoed.body).includes("replay_needs_new_address"), echoed.body),
        check("neither original is resolved", (await stored(ctx, String(spam))).stage === "problem" && (await stored(ctx, String(hard))).stage === "problem", "stage"),
      ]);
      const fixed = await replay("send a permanent bounce to another address", hard, { to: "fixed@one.test" });
      const fixedId = text(fixed.body, "sendId");
      const original = await stored(ctx, String(hard));
      const copy = await stored(ctx, fixedId);
      const mailed = await ctx.mail((message) => message.to.some((address) => address.includes("fixed@one.test")));
      await ctx.verify("a permanent bounce goes to the corrected address", [
        check("the new send is sent", fixed.status === 200 && pick(fixed.body, "status") === "sent", fixed.body),
        check("the original is resolved and points at the new send", original.stage === "resolved" && original.replayedBy === fixedId, original),
        check("the new send points back and is a real send from the fix-address flow", copy.replayOf === String(hard) && copy.source === "dms-mailing:fix-address" && !copy.isTest, copy),
        check("the e-mail reached the corrected address", mailed.match !== undefined, mailed.messages.map((message) => message.to)),
      ]);
      const againSoft = await replay("replay a temporary bounce", soft, {});
      const againFail = await replay("replay a provider failure", failed, {});
      const againOk = await replay("replay a delivered send", delivered, {});
      const againTest = await replay("replay a failed test send", testFailure, {});
      const softCopy = await stored(ctx, text(againSoft.body, "sendId"));
      const testCopy = await stored(ctx, text(againTest.body, "sendId"));
      const testMail = await ctx.mail((message) => message.to.some((address) => address.includes("testfail@one.test")));
      await ctx.verify("a temporary bounce, a failure and a delivered send go again to the same address", [
        check("temporary bounce: sent, from the replay flow", againSoft.status === 200 && pick(againSoft.body, "status") === "sent" && softCopy.source === "dms-mailing:replay", [againSoft.body, softCopy]),
        check("provider failure: sent and the original resolved", againFail.status === 200 && pick(againFail.body, "status") === "sent" && (await stored(ctx, String(failed))).stage === "resolved", againFail.body),
        check("a delivered send can be sent again", againOk.status === 200 && pick(againOk.body, "status") === "sent", againOk.body),
        check("a test send stays a test, and its mail is tagged [TEST]", testCopy.isTest && testMail.match?.subject.startsWith("[TEST]") === true, [testCopy, testMail.match?.subject]),
      ]);
    },
  },
  {
    id: "send-again-to-a-suppressed-address-sends-nothing",
    title: "sending again to an address that is on the suppression list sends nothing, warns, and leaves the original a problem",
    entryPoint: "POST /api/mailing/sends/:id/replay",
    async run(/** @type {Ctx} */ ctx) {
      await declareTemplates(ctx, [{ slug: "order", category: "orders" }]);
      const [failed] = await importSends(ctx, "a failure", [sendOf("f1", "order", "later@one.test", ago(0, 2), [FAILURE])]);
      const added = await mailing(ctx, "suppress the address", "POST", "/suppressions", { body: { email: "later@one.test" } });
      const answer = await mailing(ctx, "send again", "POST", `/sends/${String(failed)}/replay`, { body: {} });
      const original = await stored(ctx, String(failed));
      const copy = await stored(ctx, text(answer.body, "sendId"));
      const mailed = await ctx.mail((message) => message.to.some((address) => address.includes("later@one.test")), 3000);
      await ctx.verify("nothing leaves", [
        check("the address is suppressed", added.status === 200, added.body),
        check("the answer is suppressed with a warning", answer.status === 200 && pick(answer.body, "status") === "suppressed" && text(answer.body, "warning") !== "", answer.body),
        check("the original stays a problem, not linked to a replay", original.stage === "problem" && original.replayedBy === "", original),
        check("the logged attempt points back and is suppressed", copy.replayOf === String(failed) && copy.status === "suppressed", copy),
        check("no e-mail reached the sink", mailed.match === undefined, mailed.messages.map((message) => message.to)),
      ]);
    },
  },
]);
