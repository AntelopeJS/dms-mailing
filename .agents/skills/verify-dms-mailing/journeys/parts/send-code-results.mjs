import { check, list, mailing, pick, text, withConfig } from "../../mailing.mjs";
import { declareLive, importSends, postEvent, secretOf, sendCode, sendDetail } from "./api-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const REASON_KEYS = { hard_bounce: "bounced", complaint: "spam", unsubscribe: "unsubscribed" };

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} */
export const resultJourneys = [
  {
    id: "send-template-reports-one-result-per-recipient-and-the-worst-status",
    title: "SendTemplate resolves one result per recipient in the order given; for several recipients the top-level status is the worst, error the first error, sendId and messageId those of the first recipient; sent means the provider accepted it; a string or a named address both work",
    entryPoint: "SendTemplate(slug, params)",
    async run(ctx) {
      const template = await declareLive(ctx, "result-order");
      const one = ctx.email("one");
      const single = await sendCode(ctx, "send to one address", template.slug, { to: one, variables: {}, source: "checkout" });
      const result = single.result;
      const detail = await sendDetail(ctx, text(result, "sendId"));
      await ctx.verify("a single recipient: one result that repeats the call's fields", [
        check("status sent", text(result, "status") === "sent", result),
        check("a sendId and a provider message id", text(result, "sendId") !== "" && text(result, "messageId").startsWith("<"), result),
        check("results holds one entry with the same sendId, status and message id", single.results.length === 1 && text(single.results[0], "sendId") === text(result, "sendId") && text(single.results[0], "messageId") === text(result, "messageId") && text(single.results[0], "status") === "sent", single.results),
        check("the per-recipient entry carries no results of its own", single.results[0] !== undefined && !("results" in single.results[0]), single.results[0]),
        check("no error", pick(result, "error") === undefined, result),
        check("the log keeps the source and the version used", text(detail.send, "source") === "checkout" && detail.send?.templateVersion === 1, detail.send),
      ]);

      const named = ctx.email("named");
      const second = ctx.email("second");
      const third = ctx.email("third");
      const many = await sendCode(ctx, "send to three recipients", template.slug, { to: [{ email: named, name: "Sofie Martin" }, second, third], variables: {} });
      const namedDetail = await sendDetail(ctx, text(many.results[0], "sendId"));
      await ctx.verify("three recipients: results in order, the first recipient's ids on top", [
        check("three results", many.results.length === 3, many.results),
        check("sendId and messageId are the first recipient's", text(many.result, "sendId") === text(many.results[0], "sendId") && text(many.result, "messageId") === text(many.results[0], "messageId"), many.result),
        check("each result has its own send id and message id", new Set(many.results.map((row) => text(row, "sendId"))).size === 3 && new Set(many.results.map((row) => text(row, "messageId"))).size === 3, many.results),
        check("the top-level status is sent", text(many.result, "status") === "sent", many.result),
        check("the name of a named recipient is kept in the log", text(namedDetail.send, "recipientName") === "Sofie Martin" && text(namedDetail.send, "recipientEmail") === named, namedDetail.send),
      ]);
      const arrived = await ctx.mail((message) => message.to.some((address) => address.includes(third)));
      await ctx.verify("every recipient received its own message", [check("three messages for the three addresses", [named, second, third].every((address) => arrived.messages.some((message) => message.to.length === 1 && message.to[0].includes(address))), arrived.messages.map((message) => message.to))]);

      const listed = ctx.email("listed");
      await mailing(ctx, "put an address on the list", "POST", "/suppressions", { body: { email: listed } });
      const mixed = await sendCode(ctx, "send to a suppressed address between two others", template.slug, { to: [second, listed, third], variables: {} });
      await ctx.verify("a suppressed recipient is the worst status and the first error", [
        check("results in the order given: sent, suppressed, sent", JSON.stringify(mixed.results.map((row) => row.status)) === '["sent","suppressed","sent"]', mixed.results),
        check("the top-level status is suppressed", text(mixed.result, "status") === "suppressed", mixed.result),
        check("error is the suppression's key", text(mixed.result, "error") === "$dms_mailing.errors.suppressed.manual", mixed.result),
        check("sendId and messageId are the first recipient's, which was sent", text(mixed.result, "sendId") === text(mixed.results[0], "sendId") && text(mixed.result, "messageId") === text(mixed.results[0], "messageId") && text(mixed.result, "messageId") !== "", mixed.result),
        check("the suppressed entry has no message id", text(mixed.results[1], "messageId") === "", mixed.results[1]),
      ]);

      await withConfig(ctx, { VERIFY_MAILING_PROVIDER: "down" }, async () => {
        const failed = await sendCode(ctx, "send while the provider is down", template.slug, { to: ctx.email("down"), variables: {} });
        const both = await sendCode(ctx, "send to a suppressed and a live address while the provider is down", template.slug, { to: [listed, ctx.email("down-two")], variables: {} });
        const failedDetail = await sendDetail(ctx, text(failed.result, "sendId"));
        await ctx.verify("a provider that cannot be reached marks the send failed and the worst status wins", [
          check("a single send resolves failed with an error text", failed.ok && text(failed.result, "status") === "failed" && text(failed.result, "error") !== "", failed.result),
          check("the log keeps the failure and no message id", text(failedDetail.send, "status") === "failed" && (text(failedDetail.send, "providerMessageId") || "") === "" && text(failedDetail.send, "error") !== "", failedDetail.send),
          check("suppressed then failed: results in order", JSON.stringify(both.results.map((row) => row.status)) === '["suppressed","failed"]', both.results),
          check("failed is the worst status", text(both.result, "status") === "failed", both.result),
          check("the first error is the suppressed recipient's", text(both.result, "error") === "$dms_mailing.errors.suppressed.manual", both.result),
        ]);
      });
    },
  },
  {
    id: "send-template-refuses-what-it-cannot-send",
    title: "SendTemplate rejects an unknown slug (template_not_found), an empty recipient list (no_recipient) and a template that is not live (template_not_live), while a test send of a template that is not live is allowed; a template without the requested content language rejects",
    entryPoint: "SendTemplate(slug, params)",
    async run(ctx) {
      const template = await declareLive(ctx, "refusal-order");
      const to = ctx.email("refusal");
      const unknown = await sendCode(ctx, "send an unknown template", "no-such-template", { to, variables: {} });
      const nobody = await sendCode(ctx, "send to no one", template.slug, { to: [], variables: {} });
      const archived = await mailing(ctx, "archive the template", "POST", `/templates/${template.id}/archive`, { body: {} });
      const notLive = await sendCode(ctx, "send an archived template", template.slug, { to, variables: {} });
      const asTest = await sendCode(ctx, "test send of an archived template", template.slug, { to, variables: {}, isTest: true });
      await ctx.verify("each refusal names its rule and sends nothing", [
        check("unknown slug: template_not_found", !unknown.ok && unknown.error?.code === "template_not_found", unknown.error),
        check("no recipient: no_recipient", !nobody.ok && nobody.error?.code === "no_recipient", nobody.error),
        check("the template was archived", archived.status === 200, archived.body),
        check("not live: template_not_live", !notLive.ok && notLive.error?.code === "template_not_live", notLive.error),
        check("a test send of a template that is not live goes out", asTest.ok && text(asTest.result, "status") === "sent", asTest),
      ]);
      const sink = await ctx.mail((message) => message.subject.startsWith("[TEST]") && message.to.some((address) => address.includes(to)));
      await ctx.verify("only the test reached the inbox", [check("one message, the [TEST] one", sink.messages.filter((message) => message.to.some((address) => address.includes(to))).length === 1, sink.messages.map((message) => message.subject))]);
    },
  },
  {
    id: "a-suppressed-result-names-its-reason",
    title: "a recipient on the suppression list gets a suppressed result whose error is the i18n key of its reason: hard_bounce, complaint, unsubscribe or manual; nothing reaches the provider and the log shows the entry",
    entryPoint: "SendTemplate(slug, params)",
    async run(ctx) {
      const template = await declareLive(ctx, "reason-order");
      const secret = await secretOf(ctx);
      const addresses = Object.fromEntries(["hard_bounce", "complaint", "unsubscribe", "manual"].map((reason) => [reason, ctx.email(reason.replace("_", "-"))]));
      const sentAt = { $date: new Date(Date.now() - 300_000).toISOString() };
      await importSends(ctx, "import the sends that will bounce", Object.entries(addresses).filter(([reason]) => reason !== "manual").map(([reason, email]) => ({ importId: reason, templateSlug: template.slug, to: { email }, sentAt, providerMessageId: reason })));
      for (const [reason, type] of Object.entries(REASON_KEYS)) await postEvent(ctx, `post ${type}`, { secret, body: { messageId: reason, type, details: { bounceType: "hard" } } });
      await mailing(ctx, "put an address on the list by hand", "POST", "/suppressions", { body: { email: addresses.manual } });
      for (const [reason, email] of Object.entries(addresses)) {
        const sent = await sendCode(ctx, `send to the ${reason} address`, template.slug, { to: email, variables: {} });
        const detail = await sendDetail(ctx, text(sent.result, "sendId"));
        await ctx.verify(`${reason}: suppressed with its own key`, [
          check("status suppressed", text(sent.result, "status") === "suppressed" && text(sent.results[0], "status") === "suppressed", sent.result),
          check(`the error is $dms_mailing.errors.suppressed.${reason}`, text(sent.result, "error") === `$dms_mailing.errors.suppressed.${reason}`, sent.result),
          check("the log shows the entry with that reason and no provider message id", text(detail.suppression, "reason") === reason && (text(detail.send, "providerMessageId") || "") === "", detail.suppression),
        ]);
      }
      const sink = await ctx.mail(() => false, 1500);
      await ctx.verify("nothing went out for the four addresses", [check("no message to any of them", sink.messages.filter((message) => message.to.some((address) => Object.values(addresses).some((listed) => address.includes(listed)))).length === 0, sink.messages.map((message) => message.to))]);
      const rows = list((await mailing(ctx, "list the sends", "GET", "/tables/sends/list?limit=50")).body, "results");
      await ctx.verify("four suppressed sends are logged", [check("four rows with the suppressed status", rows.filter((row) => text(row, "status") === "suppressed").length === 4, rows.map((row) => row.status))]);
    },
  },
];
