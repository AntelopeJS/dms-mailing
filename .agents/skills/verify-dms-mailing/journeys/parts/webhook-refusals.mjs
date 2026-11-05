import { check, mailing, pick, raw, text } from "../../mailing.mjs";
import { SECRET_HEADER, declareLive, importSends, postEvent, secretOf, sendDetail } from "./api-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const MESSAGES = {
  missing_secret: "The x-mailing-webhook-secret header is missing. Send the webhook secret shown in Mailing > Settings > Provider & webhook.",
  invalid_event: 'The body is not a mailing event: send JSON with "messageId" and "type".',
};
const BAD_SECRET_START = "The x-mailing-webhook-secret header does not match the webhook secret of this workspace";

/**
 * @param {import("../../mailing.mjs").Raw} answer A refused call
 * @param {number} status The status wanted
 * @param {string} reason The reason wanted
 * @returns {import("../../mailing.mjs").Check[]} The checks
 */
function refused(answer, status, reason) {
  return [
    check(`HTTP ${status}`, answer.status === status, answer.status),
    check("error is webhook_refused", pick(answer.json, "error") === "webhook_refused", answer.text),
    check(`reason is ${reason}`, pick(answer.json, "reason") === reason, answer.text),
    check("the message is the readable one", reason === "bad_secret" ? text(answer.json, "message").startsWith(BAD_SECRET_START) : text(answer.json, "message") === MESSAGES[/** @type {"missing_secret" | "invalid_event"} */ (reason)], text(answer.json, "message")),
  ];
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} */
export const refusalJourneys = [
  {
    id: "a-refused-webhook-call-gets-its-status-and-reason-and-shows-in-the-status",
    title: "the webhook answers 403 missing_secret, 403 bad_secret and 400 invalid_event with a readable body, checks the secret before the body, records each refusal in the webhook status, and refuses a workspace without settings without recording it",
    entryPoint: "POST /api/mailing/events/:provider/:tenantId, GET /api/mailing/settings/webhook-status",
    async run(ctx) {
      const template = await declareLive(ctx, "refusals-order");
      const secret = await secretOf(ctx);
      const imported = await importSends(ctx, "import a send", [{ importId: "r1", templateSlug: template.slug, to: { email: ctx.email("r") }, sentAt: { $date: new Date(Date.now() - 60_000).toISOString() }, providerMessageId: "refusal-1" }]);
      const status = async () => pick((await mailing(ctx, "read the webhook status", "GET", "/settings/webhook-status")).body, "lastRefused");
      const good = { messageId: "refusal-1", type: "delivered" };

      const none = await postEvent(ctx, "no secret", { body: good });
      await ctx.verify("no header: 403 missing_secret", [...refused(none, 403, "missing_secret"), check("the status records it with the provider label and the time", text(await status(), "reason") === "missing_secret" && text(await status(), "provider") === "postmark" && Math.abs(Date.now() - Date.parse(text(await status(), "at"))) < 120_000, await status())]);
      const wrong = await postEvent(ctx, "a wrong secret of the right length", { secret: secret.replace(/./, secret[0] === "a" ? "b" : "a"), body: good });
      await ctx.verify("a wrong secret: 403 bad_secret", [...refused(wrong, 403, "bad_secret"), check("the status records it", text(await status(), "reason") === "bad_secret", await status())]);
      const shorter = await postEvent(ctx, "a secret one character short", { provider: "mailgun", secret: secret.slice(1), body: good });
      await ctx.verify("a shorter secret: 403 bad_secret", [...refused(shorter, 403, "bad_secret"), check("the status records the provider label", text(await status(), "provider") === "mailgun", await status())]);
      const longer = await postEvent(ctx, "a secret one character long", { secret: `${secret}0`, body: good });
      await ctx.verify("a longer secret: 403 bad_secret", refused(longer, 403, "bad_secret"));

      for (const [label, rawBody] of [["not JSON", "not json"], ["a JSON array", "[1]"], ["a body without a message id", '{"type":"opened"}'], ["an empty message id", '{"messageId":"","type":"opened"}'], ["an unknown type", '{"messageId":"refusal-1","type":"exploded"}'], ["a body without a type", '{"messageId":"refusal-1"}'], ["a bad date", '{"messageId":"refusal-1","type":"opened","at":"yesterday-ish"}']]) {
        const bad = await postEvent(ctx, `right secret, ${label}`, { secret, rawBody });
        await ctx.verify(`the right secret and ${label}: 400 invalid_event`, [...refused(bad, 400, "invalid_event"), check("the status records it", text(await status(), "reason") === "invalid_event", await status())]);
      }

      const order = await postEvent(ctx, "wrong secret and an invalid body", { secret: "x".repeat(10), rawBody: "not json" });
      const orderMissing = await postEvent(ctx, "no secret and an invalid body", { rawBody: "not json" });
      await ctx.verify("the secret is checked before the body", [...refused(order, 403, "bad_secret"), ...refused(orderMissing, 403, "missing_secret")]);

      const known = await status();
      const stranger = await postEvent(ctx, "a workspace without settings", { tenant: "no-such-workspace", secret, body: good });
      await ctx.verify("a workspace without settings: 403 bad_secret and nothing recorded", [
        ...refused(stranger, 403, "bad_secret"),
        check("the status of the real workspace is unchanged", JSON.stringify(await status()) === JSON.stringify(known), await status()),
      ]);

      const detail = await sendDetail(ctx, imported.ids[0]);
      await ctx.verify("no refused call touched the send", [
        check("only its first event", detail.events.length === 1, detail.events.map((event) => event.type)),
        check("still sent", text(detail.send, "status") === "sent", detail.send?.status),
      ]);
      const ok = await postEvent(ctx, "the right secret and event", { provider: "Brevo", secret, body: good });
      const received = pick((await mailing(ctx, "read the webhook status", "GET", "/settings/webhook-status")).body, "lastReceived");
      await ctx.verify("a good call is recorded and shows as the last event received", [
        check("200 recorded true", ok.status === 200 && pick(ok.json, "recorded") === true, ok.text),
        check("the status names the type, the provider label as given and the match", text(received, "type") === "delivered" && text(received, "provider") === "Brevo" && pick(received, "isMatched") === true && pick(received, "isTest") === false, received),
        check("the last refusal (the order test, no secret) is kept next to it", text(await status(), "reason") === "missing_secret", await status()),
      ]);
      const unmatched = await postEvent(ctx, "an event for no send", { secret, body: { messageId: "nobody", type: "opened" } });
      const after = pick((await mailing(ctx, "read the webhook status", "GET", "/settings/webhook-status")).body, "lastReceived");
      await ctx.verify("an event matching no send answers recorded false and shows as unmatched", [
        check("200 recorded false", unmatched.status === 200 && pick(unmatched.json, "recorded") === false, unmatched.text),
        check("the status says it matched no send", pick(after, "isMatched") === false && text(after, "type") === "opened", after),
      ]);
    },
  },
  {
    id: "the-webhook-is-reachable-through-the-dashboard-url-with-the-header-passed-on",
    title: "a provider posting through the dashboard's public URL gets the same answers as one posting to the API: the secret header is passed on and a missing one is refused",
    entryPoint: "POST <dashboard>/api/mailing/events/:provider/:tenantId",
    async run(ctx) {
      const template = await declareLive(ctx, "proxy-order");
      const secret = await secretOf(ctx);
      await importSends(ctx, "import a send", [{ importId: "p1", templateSlug: template.slug, to: { email: ctx.email("p") }, sentAt: { $date: new Date(Date.now() - 60_000).toISOString() }, providerMessageId: "proxy-1" }]);
      const through = (/** @type {string} */ label, /** @type {Record<string, string>} */ headers) =>
        raw(ctx, label, { origin: "web", path: "/api/mailing/events/postmark/default", method: "POST", headers: { "content-type": "application/json", ...headers }, body: Buffer.from(JSON.stringify({ messageId: "proxy-1", type: "opened" })) });
      const good = await through("through the dashboard with the secret", { [SECRET_HEADER]: secret });
      const none = await through("through the dashboard without the secret", {});
      await ctx.verify("the dashboard URL carries the webhook", [
        check("200 recorded true with the secret", good.status === 200 && pick(good.json, "recorded") === true, good.text),
        check("403 missing_secret without it", none.status === 403 && pick(none.json, "reason") === "missing_secret", none.text),
      ]);
    },
  },
];
