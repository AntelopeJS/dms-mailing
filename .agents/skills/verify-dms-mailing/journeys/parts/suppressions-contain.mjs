import { check, list, mailing, pick, text } from "../../mailing.mjs";
import { declareLive, entryOf, sendCode, sendDetail, settledMail, suppressionRows } from "./api-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const SUPPRESSED = "suppressed";
const MANUAL_ERROR = "$dms_mailing.errors.suppressed.manual";

/**
 * One address on the list, every path that sends.
 *
 * @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }}
 */
export const containment = {
  id: "a-suppressed-address-gets-no-mail-from-any-send-path",
  title: "an address on the suppression list gets no e-mail from SendTemplate, the real send, the test send, Send again and Send to another address, each logged as suppressed; the editor's own address still gets a test, and a reactivated address is reached again",
  entryPoint: "SendTemplate, POST /api/mailing/templates/:id/{send,test-send}, POST /api/mailing/sends/:id/replay",
  async run(ctx) {
    const victim = ctx.email("victim");
    const keeper = ctx.email("keeper");
    const stranger = ctx.email("stranger");
    const sentinel = ctx.email("sentinel");
    const own = ctx.adminCredentials().email.toLowerCase();
    const template = await declareLive(ctx, "contain-order");
    const before = await sendCode(ctx, "send to the victim before it is suppressed", template.slug, { to: victim, variables: { customer: { name: "V" } } });
    const earlier = await sendCode(ctx, "send to a stranger", template.slug, { to: stranger, variables: { customer: { name: "S" } } });
    await ctx.verify("both earlier sends go out", [
      check("the victim's first send is sent", before.results[0] === undefined ? text(before.result, "status") === "sent" : text(before.results[0], "status") === "sent", before.result),
      check("the stranger's send is sent", text(earlier.result, "status") === "sent", earlier.result),
    ], { critical: true });
    const priorId = text(before.result, "sendId");
    const strangerSendId = text(earlier.result, "sendId");

    const added = await mailing(ctx, "put the victim on the list by hand", "POST", "/suppressions", { body: { email: victim, note: "asked by phone" } });
    await ctx.verify("the victim is on the list", [check("HTTP 200 added", added.status === 200 && pick(added.body, "added") === true, added.body)], { critical: true });

    const code = await sendCode(ctx, "SendTemplate to the victim and a keeper", template.slug, { to: [victim, keeper], variables: { customer: { name: "K" } } });
    await ctx.verify("SendTemplate sends to the keeper only", [
      check("two results, in the order given", code.results.length === 2, code.results),
      check("the victim's result is suppressed with the manual reason", text(code.results[0], "status") === SUPPRESSED && text(code.results[0], "error") === MANUAL_ERROR, code.results[0]),
      check("the keeper's result is sent", text(code.results[1], "status") === "sent", code.results[1]),
      check("the top-level status is the worst one", text(code.result, "status") === SUPPRESSED, code.result),
    ]);

    const real = await mailing(ctx, "real send to the victim in capitals", "POST", `/templates/${template.id}/send`, { body: { to: [victim.toUpperCase()], data: { customer: { name: "R" } } } });
    await ctx.verify("the real send route refuses to deliver", [
      check("HTTP 200 with one suppressed result", real.status === 200 && list(real.body, "results").length === 1 && text(list(real.body, "results")[0], "status") === SUPPRESSED, real.body),
      check("the error is the manual reason", text(list(real.body, "results")[0], "error") === MANUAL_ERROR, real.body),
    ]);

    const test = await mailing(ctx, "test send to the victim", "POST", `/templates/${template.id}/test-send`, { body: { to: [victim], data: { customer: { name: "T" } } } });
    await ctx.verify("a test to another suppressed address does not go out", [
      check("HTTP 200 with one suppressed result", test.status === 200 && text(list(test.body, "results")[0], "status") === SUPPRESSED, test.body),
      check("no own-address warning for another address", pick(test.body, "ownAddressSuppressed") === undefined, test.body),
    ]);

    const again = await mailing(ctx, "Send again of the earlier send", "POST", `/sends/${priorId}/replay`, { body: {} });
    await ctx.verify("Send again stops at the list", [
      check("the result is suppressed", again.status === 200 && text(again.body, "status") === SUPPRESSED, again.body),
      check("the reason travels as the warning", text(again.body, "warning") === MANUAL_ERROR, again.body),
    ]);

    const other = await mailing(ctx, "Send to another address: the victim", "POST", `/sends/${strangerSendId}/replay`, { body: { to: victim } });
    await ctx.verify("Send to another address stops at the list", [
      check("the result is suppressed", other.status === 200 && text(other.body, "status") === SUPPRESSED, other.body),
      check("the reason travels as the warning", text(other.body, "warning") === MANUAL_ERROR, other.body),
    ]);

    await mailing(ctx, "put the editor's own address on the list", "POST", "/suppressions", { body: { email: own } });
    const ownTest = await mailing(ctx, "test send to the editor's own suppressed address", "POST", `/templates/${template.id}/test-send`, { body: { to: [own], data: { customer: { name: "O" } } } });
    await ctx.verify("a test to the editor's own address still goes out, with a warning", [
      check("the result is not suppressed", ownTest.status === 200 && text(list(ownTest.body, "results")[0], "status") === "sent", ownTest.body),
      check("the answer carries the own-address entry", text(pick(ownTest.body, "ownAddressSuppressed"), "email") === own && text(pick(ownTest.body, "ownAddressSuppressed"), "reason") === "manual", ownTest.body),
    ]);

    await sendCode(ctx, "send to the sentinel", template.slug, { to: sentinel, variables: { customer: { name: "Z" } } });
    const { messages } = await settledMail(ctx, sentinel);
    const to = (/** @type {string} */ address) => messages.filter((message) => message.to.some((entry) => entry.includes(address)));
    await ctx.verify("the mail sink holds nothing for the victim after the first send", [
      check("exactly one message to the victim: the one sent before the suppression", to(victim).length === 1, to(victim).map((message) => message.subject)),
      check("one message to the keeper", to(keeper).length === 1, to(keeper).length),
      check("one [TEST] message to the editor's own address", to(own).length === 1 && to(own)[0]?.subject.startsWith("[TEST] ") === true, to(own).map((message) => message.subject)),
      check("one message to the stranger", to(stranger).length === 1, to(stranger).length),
    ]);

    const log = await mailing(ctx, "read the send log", "GET", "/tables/sends/list?limit=100");
    const suppressedRows = list(log.body, "results").filter((row) => text(row, "recipientEmail").toLowerCase() === victim && text(row, "status") === SUPPRESSED);
    await ctx.verify("every blocked attempt is logged as suppressed", [
      check("five suppressed sends for the victim", suppressedRows.length === 5, suppressedRows.map((row) => text(row, "source"))),
      check("each keeps the reason as its error", suppressedRows.every((row) => text(row, "error") === MANUAL_ERROR), suppressedRows.map((row) => row.error)),
      check("each is in the suppressed stage", suppressedRows.every((row) => text(row, "stage") === SUPPRESSED), suppressedRows.map((row) => row.stage)),
    ]);
    const first = suppressedRows[0];
    const detail = await sendDetail(ctx, text(first, "_id"));
    await ctx.verify("a suppressed send reached no provider", [
      check("no provider message id", (text(detail.send, "providerMessageId") || "") === "", detail.send?.providerMessageId),
      check("its detail names the suppression entry", text(detail.suppression, "email") === victim, detail.suppression),
    ]);

    const rows = await suppressionRows(ctx);
    const entry = entryOf(rows, victim);
    const lifted = await mailing(ctx, "reactivate the victim", "DELETE", `/suppressions/${text(entry, "_id")}`);
    const reached = await sendCode(ctx, "send to the reactivated victim", template.slug, { to: victim, variables: { customer: { name: "A" } } });
    const arrived = await ctx.mail((message) => message.to.some((address) => address.includes(victim)) && message.receivedAt > (messages.findLast((message2) => message2.to.some((entry2) => entry2.includes(victim)))?.receivedAt ?? ""));
    await ctx.verify("a reactivated address is reached again", [
      check("the entry is removed", lifted.status === 200, lifted.body),
      check("the send is sent", text(reached.result, "status") === "sent", reached.result),
      check("the mail sink received a second message", arrived.messages.filter((message) => message.to.some((address) => address.includes(victim))).length === 2, arrived.messages.length),
    ]);
  },
};
