import { calling, check, mailing, pick, text } from "../../mailing.mjs";
import { declareLive, entryOf, importSends, postEvent, secretOf, sendDetail, suppressionRows } from "./api-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const NOW = () => ({ $date: new Date(Date.now() - 300_000).toISOString() });

/**
 * @param {Ctx} ctx The journey
 * @param {string} slug The template
 * @param {string[]} messageIds One imported send per id
 * @returns {Promise<string[]>} The send ids
 */
async function sendsFor(ctx, slug, messageIds) {
  const done = await importSends(ctx, `import ${messageIds.length} sends`, messageIds.map((id) => ({ importId: id, templateSlug: slug, to: { email: ctx.email(id) }, sentAt: NOW(), providerMessageId: id })));
  return done.ids;
}

/**
 * @param {Ctx} ctx The journey
 * @param {string} sendId The send
 * @returns {Promise<{ status: string, opens: unknown, clicks: unknown, error: string, types: string[] }>} Where it stands
 */
async function standing(ctx, sendId) {
  const detail = await sendDetail(ctx, sendId);
  return { status: text(detail.send, "status"), opens: detail.send?.opens, clicks: detail.send?.clicks, error: text(detail.send, "error"), types: detail.events.map((event) => text(event, "type")) };
}

/** [event type, status after it, opens, clicks] from a send that starts `sent`. */
const FORWARD = [
  ["delivered", "delivered", 0, 0], ["queued", "delivered", 0, 0], ["sent", "delivered", 0, 0],
  ["opened", "opened", 1, 0], ["delivered", "opened", 1, 0], ["opened", "opened", 2, 0],
  ["clicked", "clicked", 2, 1], ["opened", "clicked", 3, 1], ["clicked", "clicked", 3, 2],
  ["unsubscribed", "unsubscribed", 3, 2], ["clicked", "unsubscribed", 3, 3],
  ["spam", "spam", 3, 3], ["unsubscribed", "spam", 3, 3],
  ["bounced", "bounced", 3, 3], ["failed", "bounced", 3, 3], ["spam", "bounced", 3, 3], ["delivered", "bounced", 3, 3],
];

/** [event type, status after it] for a send that failed first: from delivered on the event replaces the failure. */
const AFTER_FAILED = [
  ["delivered", "delivered"], ["opened", "opened"], ["clicked", "clicked"], ["unsubscribed", "unsubscribed"], ["spam", "spam"], ["bounced", "bounced"],
  ["queued", "failed"], ["sent", "failed"], ["failed", "failed"],
];

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} */
export const eventJourneys = [
  {
    id: "a-send-status-only-moves-forward-and-counts-opens-and-clicks",
    title: "events move a send's status forward only in the order queued, sent, delivered, opened, clicked, unsubscribed, spam, bounced or failed, every event joins the timeline, opens and clicks are counted, and from failed any event from delivered on replaces the failure",
    entryPoint: "POST /api/mailing/events/:provider/:tenantId, GET /api/mailing/sends/:id",
    async run(ctx) {
      const template = await declareLive(ctx, "ordering-order");
      const secret = await secretOf(ctx);
      const [forward, ...failedSends] = await sendsFor(ctx, template.slug, ["forward", ...AFTER_FAILED.map(([type]) => `failed-${type}`)]);
      const seen = ["sent"];
      for (const [type, status, opens, clicks] of FORWARD) {
        const answer = await postEvent(ctx, `post ${type}`, { secret, body: { messageId: "forward", type } });
        seen.push(String(type));
        const now = await standing(ctx, forward);
        await ctx.verify(`${type} on a send that is ${seen.length === 2 ? "sent" : "further on"}: the status is ${status}`, [
          check("recorded", pick(answer.json, "recorded") === true, answer.text),
          check(`status ${status}`, now.status === status, now.status),
          check(`${opens} opens and ${clicks} clicks`, now.opens === opens && now.clicks === clicks, [now.opens, now.clicks]),
          check("every event is in the timeline, in order", JSON.stringify(now.types) === JSON.stringify(seen), now.types),
        ]);
      }
      for (const [index, [type, status]] of AFTER_FAILED.entries()) {
        const messageId = `failed-${type}`;
        await postEvent(ctx, "fail first", { secret, body: { messageId, type: "failed", details: { reason: "421 4.3.0 deferred" } } });
        const failed = await standing(ctx, failedSends[index]);
        await postEvent(ctx, `then ${type}`, { secret, body: { messageId, type, details: type === "bounced" ? { reason: "550 gone", bounceType: "soft" } : {} } });
        const now = await standing(ctx, failedSends[index]);
        const reasonKept = type === "bounced" ? "550 gone" : type === "spam" || type === "failed" || ["queued", "sent"].includes(type) ? "421 4.3.0 deferred" : "";
        await ctx.verify(`failed, then ${type}: ${status}`, [
          check("failed first, with the provider's words as the error", failed.status === "failed" && failed.error === "421 4.3.0 deferred", failed),
          check(`status ${status}`, now.status === status, now.status),
          check(type === "bounced" ? "the bounce's words replace the error" : reasonKept ? "the failure's words stay" : "the error is cleared once it is delivered on", now.error === reasonKept, now.error),
        ]);
      }
    },
  },
  {
    id: "a-retried-webhook-event-is-recorded-once",
    title: "an event repeated with the same details.eventId, or with the same type, time and details, answers recorded false and counts once; a different id, time or details is a new event; at defaults to now and details are kept",
    entryPoint: "POST /api/mailing/events/:provider/:tenantId",
    async run(ctx) {
      const template = await declareLive(ctx, "retry-order");
      const secret = await secretOf(ctx);
      const [byId, byTime] = await sendsFor(ctx, template.slug, ["by-id", "by-time"]);
      /** @type {Array<[string, string, object, boolean, number]>} */
      const plan = [
        ["by-id", "opened", { eventId: "e1" }, true, 1],
        ["by-id", "opened", { eventId: "e1" }, false, 1],
        ["by-id", "opened", { eventId: "e1", url: "https://other.example" }, false, 1],
        ["by-id", "opened", { eventId: "e2" }, true, 2],
        ["by-id", "clicked", { eventId: "e1" }, false, 2],
      ];
      for (const [messageId, type, details, recorded, opens] of plan) {
        const answer = await postEvent(ctx, `post ${type} ${JSON.stringify(details)}`, { secret, body: { messageId, type, details } });
        await ctx.verify(`${JSON.stringify(details)}: recorded ${recorded}`, [check(`recorded ${recorded}`, pick(answer.json, "recorded") === recorded, answer.text), check(`${opens} opens`, (await standing(ctx, byId)).opens === opens, "opens")]);
      }
      const at = "2026-09-09T10:00:00.000Z";
      /** @type {Array<[string, object, boolean, number]>} */
      const timed = [
        [at, { reason: "x" }, true, 1],
        [at, { reason: "x" }, false, 1],
        ["2026-09-09T10:00:01.000Z", { reason: "x" }, true, 2],
        [at, { reason: "y" }, true, 3],
      ];
      for (const [when, details, recorded, opens] of timed) {
        const answer = await postEvent(ctx, `post opened at ${when} ${JSON.stringify(details)}`, { secret, body: { messageId: "by-time", type: "opened", at: when, details } });
        await ctx.verify(`opened at ${when} with ${JSON.stringify(details)}: recorded ${recorded}`, [check(`recorded ${recorded}`, pick(answer.json, "recorded") === recorded, answer.text), check(`${opens} opens`, (await standing(ctx, byTime)).opens === opens, "opens")]);
      }
      const noTime1 = await postEvent(ctx, "opened without a time", { secret, body: { messageId: "by-time", type: "opened" } });
      const noTime2 = await postEvent(ctx, "opened without a time again", { secret, body: { messageId: "by-time", type: "opened" } });
      await ctx.verify("without a time and an id, each event is new", [check("both recorded", pick(noTime1.json, "recorded") === true && pick(noTime2.json, "recorded") === true, [noTime1.text, noTime2.text]), check("five opens", (await standing(ctx, byTime)).opens === 5, "opens")]);
      const events = (await sendDetail(ctx, byTime)).events;
      const stored = events.find((event) => text(event, "at") === at);
      const defaulted = events.at(-1);
      await ctx.verify("the time given is kept and the default is now", [
        check("the given time is stored", stored !== undefined, events.map((event) => event.at)),
        check("the defaulted time is within a minute of now", defaulted !== undefined && Math.abs(Date.now() - Date.parse(text(defaulted, "at"))) < 60_000, defaulted?.at),
        check("the details are kept as JSON", text(stored, "json_details") === JSON.stringify({ reason: "x" }), stored?.json_details),
      ]);
    },
  },
  {
    id: "record-email-event-does-what-the-webhook-does",
    title: "RecordEmailEvent resolves true for a recorded event and false for an unknown message or a repeated event id, moves the status, counts opens and suppresses on a hard bounce",
    entryPoint: "RecordEmailEvent(tenantId, event)",
    async run(ctx) {
      const template = await declareLive(ctx, "record-order");
      const [one, two] = await sendsFor(ctx, template.slug, ["rec-1", "rec-2"]);
      const record = (/** @type {string} */ label, /** @type {object} */ event) => calling(ctx, label, "record", ["default", { provider: "relay", ...event }]);
      const opened = await record("record opened", { messageId: "rec-1", type: "opened", at: { $date: "2026-09-09T10:00:00.000Z" }, details: { eventId: "r1" } });
      const again = await record("record it again", { messageId: "rec-1", type: "opened", details: { eventId: "r1" } });
      const unknown = await record("record for an unknown message", { messageId: "nobody", type: "opened" });
      const now = await standing(ctx, one);
      await ctx.verify("RecordEmailEvent answers a boolean and moves the send", [
        check("true when recorded", opened.ok && opened.result === true, opened),
        check("false when repeated", again.ok && again.result === false, again),
        check("false for an unknown message", unknown.ok && unknown.result === false, unknown),
        check("opened once", now.status === "opened" && now.opens === 1, now),
      ]);
      const bounced = await record("record a hard bounce", { messageId: "rec-2", type: "bounced", details: { bounceType: "hard", reason: "550 no" } });
      const entry = entryOf(await suppressionRows(ctx), ctx.email("rec-2"));
      await ctx.verify("a hard bounce through RecordEmailEvent suppresses", [
        check("true", bounced.result === true, bounced),
        check("a hard_bounce entry pointing at the send with the provider's words", text(entry, "reason") === "hard_bounce" && text(entry, "sendId") === two && text(entry, "detail") === "550 no", entry),
        check("the send is bounced with the reason as its error", (await standing(ctx, two)).status === "bounced" && (await standing(ctx, two)).error === "550 no", await standing(ctx, two)),
      ]);
      const settings = await mailing(ctx, "read the settings", "GET", "/settings");
      await ctx.verify("no secret is involved on this path", [check("the module stored its own secret, never sent here", text(settings.body, "webhookSecret").length === 48, settings.body)]);
    },
  },
];
