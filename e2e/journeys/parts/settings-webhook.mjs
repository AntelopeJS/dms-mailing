import { check, list, mailing, pick, text } from "../../mailing.mjs";
import { declareLive, importSends, postEvent, secretOf, sendDetail } from "./api-kit.mjs";
import { putSettings } from "./settings-basics.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const TOO_SHORT = "$dms_mailing.settings.fields.webhookSecret.too_short";
const TEST_MESSAGE_ID = "dms-mailing-webhook-test";

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} */
export const webhookSettingsJourneys = [
  {
    id: "rotating-the-webhook-secret-stops-the-old-one-at-once",
    title: "Rotate issues a new 48 character secret that the webhook accepts, the old one is refused at once (403 bad_secret), the new one survives a restart; a pasted secret needs 32 to 120 characters and works",
    entryPoint: "POST /api/mailing/settings/webhook-secret/rotate, PUT /api/mailing/settings",
    async run(ctx) {
      const template = await declareLive(ctx, "rotate-order");
      await importSends(ctx, "import a send", [{ importId: "rot", templateSlug: template.slug, to: { email: ctx.email("rot") }, sentAt: { $date: new Date(Date.now() - 60_000).toISOString() }, providerMessageId: "rot-1" }]);
      const old = await secretOf(ctx);
      const rotated = await mailing(ctx, "rotate the secret", "POST", "/settings/webhook-secret/rotate");
      const fresh = text(rotated.body, "value");
      const oldTry = await postEvent(ctx, "post with the old secret", { secret: old, body: { messageId: "rot-1", type: "opened" } });
      const freshTry = await postEvent(ctx, "post with the new secret", { secret: fresh, body: { messageId: "rot-1", type: "opened" } });
      await ctx.verify("the rotated secret replaces the old one at once", [
        check("HTTP 200 with a 48 hexadecimal character value", rotated.status === 200 && /^[0-9a-f]{48}$/.test(fresh) && fresh !== old, rotated.body),
        check("the settings show the new secret", (await secretOf(ctx)) === fresh, "other"),
        check("the old secret is refused: 403 bad_secret", oldTry.status === 403 && pick(oldTry.json, "reason") === "bad_secret", oldTry.text),
        check("the new secret is accepted", freshTry.status === 200 && pick(freshTry.json, "recorded") === true, freshTry.text),
      ]);
      const second = text((await mailing(ctx, "rotate again", "POST", "/settings/webhook-secret/rotate")).body, "value");
      await ctx.restartBackend();
      const stored = await secretOf(ctx);
      await ctx.verify("every rotation gives a different secret and it is stored", [check("a third, different secret", second !== fresh && second !== old, [old, fresh, second]), check("kept after a restart", stored === second, stored)]);

      const short = await putSettings(ctx, "paste a secret of 31 characters", { webhookSecret: "s".repeat(31) });
      const empty = await putSettings(ctx, "clear the secret", { webhookSecret: null });
      const long = await putSettings(ctx, "paste a secret of 121 characters", { webhookSecret: "s".repeat(121) });
      await ctx.verify("a pasted secret needs 32 to 120 characters", [
        check("31: 400 under webhookSecret with the too-short text", short.status === 400 && JSON.stringify(list(short.body, "issues")[0]?.path) === '["webhookSecret"]' && text(list(short.body, "issues")[0], "message") === TOO_SHORT, short.body),
        check("blank: 400", empty.status === 400, empty.body),
        check("121: 400", long.status === 400, long.body),
        check("the secret is unchanged by the refusals", (await secretOf(ctx)) === second, "changed"),
      ]);
      for (const length of [32, 120]) {
        const pasted = "p".repeat(length);
        const ok = await putSettings(ctx, `paste a secret of ${length} characters`, { webhookSecret: pasted });
        const used = await postEvent(ctx, `post with the pasted secret of ${length}`, { secret: pasted, body: { messageId: "rot-1", type: "opened" } });
        await ctx.verify(`a pasted secret of ${length} characters is accepted and used`, [check("HTTP 200", ok.status === 200, ok.body), check("the webhook accepts it", used.status === 200, used.text), check("the settings show it", (await secretOf(ctx)) === pasted, "other")]);
      }
    },
  },
  {
    id: "the-test-event-reaches-the-webhook-and-touches-no-send",
    title: "Send a test event posts a delivered test event to the webhook URL from the server with the stored secret, answers the URL, the HTTP status and the duration, shows as the last event received (test) in the status, touches no send, and the webhook answers a test message id with recorded false and test true",
    entryPoint: "POST /api/mailing/settings/webhook-test, GET /api/mailing/settings/webhook-status",
    async run(ctx) {
      const template = await declareLive(ctx, "test-event-order");
      const imported = await importSends(ctx, "import a send that carries the test message id", [{ importId: "te", templateSlug: template.slug, to: { email: ctx.email("te") }, sentAt: { $date: new Date(Date.now() - 60_000).toISOString() }, providerMessageId: TEST_MESSAGE_ID }]);
      const before = await sendDetail(ctx, imported.ids[0]);
      const settings = await mailing(ctx, "read the settings", "GET", "/settings");
      const tested = await mailing(ctx, "send a test event", "POST", "/settings/webhook-test");
      const status = pick(tested.body, "status");
      const after = await sendDetail(ctx, imported.ids[0]);
      await ctx.verify("the test event is received", [
        check("HTTP 200 and received", tested.status === 200 && pick(tested.body, "isReceived") === true, tested.body),
        check("it names the webhook URL the settings show", pick(tested.body, "url") === pick(settings.body, "webhookUrl"), pick(tested.body, "url")),
        check("the URL answered 200 within a few seconds", pick(tested.body, "httpStatus") === 200 && Number(pick(tested.body, "durationMs")) >= 0 && Number(pick(tested.body, "durationMs")) < 10_000, [pick(tested.body, "httpStatus"), pick(tested.body, "durationMs")]),
        check("no refusal and no network error", pick(tested.body, "refusal") === undefined && pick(tested.body, "networkError") === undefined, tested.body),
        check("the status shows a delivered test event from the provider label", text(status, "lastReceived", "type") === "delivered" && pick(status, "lastReceived", "isTest") === true && pick(status, "lastReceived", "isMatched") === false && text(status, "lastReceived", "provider") === "nodemailer", status),
        check("the status carries the time of the event", Math.abs(Date.now() - Date.parse(text(status, "lastReceived", "at"))) < 120_000, pick(status, "lastReceived", "at")),
        check("the send carrying the test message id is untouched", after.send?.status === before.send?.status && after.events.length === before.events.length && after.send?.revision === before.send?.revision, [before.events.length, after.events.length]),
      ]);
      const secret = text(settings.body, "webhookSecret");
      const direct = await postEvent(ctx, "post the test message id with the secret", { secret, body: { messageId: TEST_MESSAGE_ID, type: "bounced", details: { bounceType: "hard" } } });
      const touched = await sendDetail(ctx, imported.ids[0]);
      await ctx.verify("the test message id answers recorded false and test true and records nothing", [
        check("200 {recorded: false, test: true}", direct.status === 200 && pick(direct.json, "recorded") === false && pick(direct.json, "test") === true, direct.text),
        check("the send did not bounce", touched.send?.status === before.send?.status && touched.events.length === before.events.length, touched.send?.status),
        check("no suppression entry", touched.suppression === null, touched.suppression),
      ]);
      await mailing(ctx, "rotate the secret", "POST", "/settings/webhook-secret/rotate");
      const again = await mailing(ctx, "send a test event after rotating", "POST", "/settings/webhook-test");
      await ctx.verify("the test event always uses the stored secret", [check("received after a rotation", pick(again.body, "isReceived") === true, again.body)]);
    },
  },
];
