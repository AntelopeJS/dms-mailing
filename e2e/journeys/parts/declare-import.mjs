import { calling, check, list, mailing, pick, text } from "../../mailing.mjs";
import { declareLive, importSends, sendDetail, suppressionRows } from "./api-kit.mjs";
import { putSettings } from "./settings-basics.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const HOUR = 3_600_000;
const iso = (/** @type {number} */ offset) => ({ $date: new Date(Date.now() - 3 * 24 * HOUR + offset).toISOString() });
const MINUTE = 60_000;

/**
 * @param {Ctx} ctx The journey
 * @param {Array<Record<string, any>>} sends The imported payload
 * @param {{ ids: string[], result: unknown }} done The first import
 * @returns {Promise<void>}
 */
async function importedData(ctx, sends, done) {
  const rows = list((await mailing(ctx, "list the sends", "GET", "/tables/sends/list?limit=50")).body, "results");
  const row = (/** @type {number} */ index) => rows.find((entry) => text(entry, "_id") === done.ids[index]);
  const detail = (/** @type {number} */ index) => sendDetail(ctx, done.ids[index]);
  await ctx.verify("a send keeps its own date, with no event it is sent, and the defaults apply", [
    check("the log date is the date given", Date.parse(text(row(0), "createdAt")) === Date.parse(text(sends[0], "sentAt", "$date")), row(0)?.createdAt),
    check("no event: status sent, one sent event", text(row(0), "status") === "sent" && (await detail(0)).events.length === 1, row(0)),
    check("source defaults to import, locale to the workspace fallback", text(row(0), "source") === "import" && text(row(0), "locale") === "fr" && (text(row(0), "requestedLocale") || "") === "", row(0)),
    check("the published version is recorded", row(0)?.templateVersion === 1, row(0)?.templateVersion),
  ]);
  await importedStatus(ctx, sends, done);
  await importedOptional(ctx, done);
}

/**
 * @param {Ctx} ctx The journey
 * @param {Array<Record<string, any>>} _sends The imported payload
 * @param {{ ids: string[] }} done The first import
 * @returns {Promise<void>}
 */
async function importedStatus(ctx, _sends, done) {
  const rows = list((await mailing(ctx, "list the sends", "GET", "/tables/sends/list?limit=50")).body, "results");
  const row = (/** @type {number} */ index) => rows.find((entry) => text(entry, "_id") === done.ids[index]);
  const detail = (/** @type {number} */ index) => sendDetail(ctx, done.ids[index]);
  const engaged = await detail(1);
  const bounced = await detail(2);
  const recovered = await detail(3);
  await ctx.verify("the status and counters follow from the events, whatever their order", [
    check("delivered, opened twice, clicked once: clicked", text(engaged.send, "status") === "clicked" && engaged.send?.opens === 2 && engaged.send?.clicks === 1, engaged.send),
    check("the timeline is in time order", JSON.stringify(engaged.events.map((event) => event.type)) === '["delivered","opened","opened","clicked"]', engaged.events.map((event) => event.type)),
    check("a hard bounce: bounced with the provider's words", text(bounced.send, "status") === "bounced" && text(bounced.send, "error") === "550 gone" && bounced.send?.isSoftBounce === false, bounced.send),
    check("failed then delivered: delivered, error cleared", text(recovered.send, "status") === "delivered" && (text(recovered.send, "error") || "") === "", recovered.send),
    check("a spam report: spam", text(row(6), "status") === "spam", row(6)?.status),
  ]);
}

/**
 * @param {Ctx} ctx The journey
 * @param {{ ids: string[] }} done The first import
 * @returns {Promise<void>}
 */
async function importedOptional(ctx, done) {
  const detail = (/** @type {number} */ index) => sendDetail(ctx, done.ids[index]);
  const repeats = await detail(4);
  const meta = await detail(5);
  await ctx.verify("repeated events are dropped like the webhook does", [
    check("five events given, three kept: the repeat by time and details, and by event id", repeats.events.length === 3 && repeats.send?.opens === 3, repeats.events.map((event) => [event.type, event.at])),
  ]);
  await ctx.verify("the optional fields are kept as given", [
    check("locale, source, test flag, provider, message id and variables", text(meta.send, "locale") === "fr" && text(meta.send, "requestedLocale") === "fr" && text(meta.send, "source") === "legacy" && meta.send?.isTest === true && text(meta.send, "provider") === "brevo" && text(meta.send, "providerMessageId") === "brevo-1" && text(meta.send, "json_variables") === '{"plan":"pro"}', meta.send),
    check("the recipient's name is kept", text(meta.send, "recipientName") === "Meta Person", meta.send?.recipientName),
  ]);
}

/**
 * @param {Ctx} ctx The journey
 * @param {string} slug The template
 * @param {Array<Record<string, any>>} sends The imported payload
 * @param {{ ids: string[] }} done The first import
 * @returns {Promise<void>}
 */
async function reimport(ctx, slug, sends, done) {
  const to = (/** @type {string} */ name) => ({ email: ctx.email(name) });
  const detail = (/** @type {number} */ index) => sendDetail(ctx, done.ids[index]);
  const again = await importSends(ctx, "import the same payload again with other variables", sends.map((entry) => ({ ...entry, variables: { changed: true } })));
  const unchanged = await detail(5);
  await ctx.verify("importing an importId again skips it untouched", [
    check("imported 0, skipped 7", pick(again.result, "imported") === 0 && pick(again.result, "skipped") === 7, again.result),
    check("the same send ids, in the same order", JSON.stringify(again.ids) === JSON.stringify(done.ids), again.ids),
    check("nothing was updated", text(unchanged.send, "json_variables") === '{"plan":"pro"}' && (await detail(1)).events.length === 4, unchanged.send),
  ]);
  const mixed = await importSends(ctx, "import one known and one new send", [sends[0], { importId: "i-new", templateSlug: slug, to: to("new"), sentAt: iso(0) }]);
  await ctx.verify("a batch can mix known and new sends", [check("imported 1, skipped 1, ids in order", pick(mixed.result, "imported") === 1 && pick(mixed.result, "skipped") === 1 && mixed.ids[0] === done.ids[0] && mixed.ids[1] !== done.ids[1], mixed)]);
}

/**
 * @param {Ctx} ctx The journey
 * @returns {Promise<void>}
 */
async function notASend(ctx) {
  const sink = await ctx.mail(() => false, 1500);
  const suppressed = await suppressionRows(ctx);
  await ctx.verify("an import is not a send", [
    check("nothing was delivered", sink.messages.length === 0, sink.messages.map((message) => message.to)),
    check("a hard bounce and a spam report in an import suppress nobody", suppressed.length === 0, suppressed),
  ]);
  const windowDay = await mailing(ctx, "figures of the last 24 hours", "GET", `/sends/stats?from=${encodeURIComponent(new Date(Date.now() - 24 * HOUR).toISOString())}&comparison=none`);
  const windowWeek = await mailing(ctx, "figures of the last 7 days", "GET", `/sends/stats?from=${encodeURIComponent(new Date(Date.now() - 7 * 24 * HOUR).toISOString())}&comparison=none`);
  await ctx.verify("the figures read the date of the import", [
    check("none of the sends of three days ago is in the last 24 hours", pick(windowDay.body, "sends") === 0, pick(windowDay.body, "sends")),
    check("seven real sends and one test in the last 7 days (the test is not a send figure)", pick(windowWeek.body, "sends") === 7 && pick(windowWeek.body, "tests") === 1, [pick(windowWeek.body, "sends"), pick(windowWeek.body, "tests")]),
  ]);
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} */
export const importJourneys = [
  {
    id: "import-sends-writes-past-sends-with-their-dates-and-events-and-skips-known-ones",
    title: "ImportSends writes past sends with their own date, locale, source and events (status and counters follow from the events in any order, repeated events are dropped, no event means sent), answers imported, skipped and the send ids in order, and importing the same importId again skips it untouched",
    entryPoint: "ImportSends({ tenantId, sends })",
    async run(ctx) {
      const template = await declareLive(ctx, "import-order");
      await putSettings(ctx, "set the fallback locale to fr", { fallbackLocale: "fr" });
      const to = (/** @type {string} */ name) => ({ email: ctx.email(name) });
      const sends = [
        { importId: "i-plain", templateSlug: template.slug, to: to("plain"), sentAt: iso(0) },
        { importId: "i-engaged", templateSlug: template.slug, to: to("engaged"), sentAt: iso(0), locale: "en", events: [{ type: "clicked", at: iso(2 * HOUR) }, { type: "delivered", at: iso(MINUTE) }, { type: "opened", at: iso(HOUR) }, { type: "opened", at: iso(90 * MINUTE) }] },
        { importId: "i-bounced", templateSlug: template.slug, to: to("bounced"), sentAt: iso(0), events: [{ type: "bounced", at: iso(MINUTE), details: { bounceType: "hard", reason: "550 gone" } }] },
        { importId: "i-recovered", templateSlug: template.slug, to: to("recovered"), sentAt: iso(0), events: [{ type: "failed", at: iso(MINUTE), details: { reason: "421 deferred" } }, { type: "delivered", at: iso(2 * MINUTE) }] },
        { importId: "i-repeats", templateSlug: template.slug, to: to("repeats"), sentAt: iso(0), events: [{ type: "opened", at: iso(MINUTE), details: { x: 1 } }, { type: "opened", at: iso(MINUTE), details: { x: 1 } }, { type: "opened", at: iso(2 * MINUTE), details: { eventId: "same" } }, { type: "opened", at: iso(3 * MINUTE), details: { eventId: "same" } }, { type: "opened", at: iso(4 * MINUTE), details: { x: 2 } }] },
        { importId: "i-meta", templateSlug: template.slug, to: { email: ctx.email("meta"), name: "Meta Person" }, sentAt: iso(0), locale: "fr", source: "legacy", isTest: true, provider: "brevo", providerMessageId: "brevo-1", variables: { plan: "pro" } },
        { importId: "i-spam", templateSlug: template.slug, to: to("spam"), sentAt: iso(0), events: [{ type: "spam", at: iso(MINUTE) }] },
      ];
      const done = await importSends(ctx, "import seven past sends", sends);
      await ctx.verify("the result counts the sends and lists their ids in order", [
        check("imported 7, skipped 0", pick(done.result, "imported") === 7 && pick(done.result, "skipped") === 0, done.result),
        check("seven distinct send ids", new Set(done.ids).size === 7, done.ids),
      ], { critical: true });
      await importedData(ctx, sends, done);
      await reimport(ctx, template.slug, sends, done);
      await notASend(ctx);
    },
  },
  {
    id: "import-sends-refuses-bad-payloads-before-writing-anything",
    title: "ImportSends rejects an unknown template (template_not_found), a blank tenantId, a bad address, a blank or 201 character importId, an unknown event type and an invalid date with invalid_import, and a refused batch writes nothing; a 200 character importId is fine",
    entryPoint: "ImportSends({ tenantId, sends })",
    async run(ctx) {
      const template = await declareLive(ctx, "import-bad-order");
      const base = { importId: "ok-1", templateSlug: template.slug, to: { email: ctx.email("ok") }, sentAt: iso(0) };
      const refused = async (/** @type {string} */ label, /** @type {string} */ code, /** @type {{ tenantId?: string | null, sends: unknown[] }} */ payload) => {
        const outcome = await calling(ctx, label, "import", [{ tenantId: "default", ...payload }]);
        return check(`${label}: rejects with ${code}`, !outcome.ok && outcome.error?.code === code, outcome.error ?? outcome.result);
      };
      await ctx.verify("each bad payload is rejected with its code", [
        await refused("an unknown template", "template_not_found", { sends: [base, { ...base, importId: "ok-2", templateSlug: "no-such-template" }] }),
        await refused("a blank tenant id", "invalid_import", { tenantId: "  ", sends: [base] }),
        await refused("a bad address", "invalid_import", { sends: [{ ...base, to: { email: "nope" } }] }),
        await refused("a blank importId", "invalid_import", { sends: [{ ...base, importId: "  " }] }),
        await refused("an importId of 201 characters", "invalid_import", { sends: [{ ...base, importId: "k".repeat(201) }] }),
        await refused("an unknown event type", "invalid_import", { sends: [{ ...base, events: [{ type: "exploded", at: iso(0) }] }] }),
        await refused("an invalid sent date", "invalid_import", { sends: [{ ...base, sentAt: "not a date" }] }),
        await refused("an event without a date", "invalid_import", { sends: [{ ...base, events: [{ type: "opened" }] }] }),
      ]);
      const rows = list((await mailing(ctx, "list the sends", "GET", "/tables/sends/list?limit=50")).body, "results");
      await ctx.verify("a refused batch wrote nothing, not even its valid first send", [check("the log is empty", rows.length === 0, rows.length)]);
      const long = await importSends(ctx, "import with an importId of 200 characters", [{ ...base, importId: "k".repeat(200) }]);
      const empty = await importSends(ctx, "import an empty batch", []);
      await ctx.verify("the limits are exact", [
        check("200 characters are accepted", pick(long.result, "imported") === 1, long),
        check("an empty batch imports nothing", pick(empty.result, "imported") === 0 && pick(empty.result, "skipped") === 0 && empty.ids.length === 0, empty),
      ]);
    },
  },
  {
    id: "an-import-raises-no-bell-notification",
    title: "importing recent sends that bounced raises no problem notification for the owners, although the same events through the webhook would",
    entryPoint: "ImportSends, the bell inbox",
    async run(ctx) {
      const template = await declareLive(ctx, "import-alarm");
      const recent = { $date: new Date(Date.now() - 10 * MINUTE).toISOString() };
      const sends = Array.from({ length: 10 }, (_, index) => ({ importId: `al-${index}`, templateSlug: template.slug, to: { email: ctx.email(`al${index}`) }, sentAt: recent, events: index < 5 ? [{ type: "bounced", at: recent, details: { bounceType: "hard" } }] : [] }));
      const done = await importSends(ctx, "import ten recent sends, five of them bounced", sends);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const inbox = await ctx.api("read the owner's bell", { method: "GET", path: "/dms/pages/settings/user/notifications/inbox", as: "admin" });
      await ctx.verify("no mailing notification, no suppression", [
        check("ten sends imported", pick(done.result, "imported") === 10, done.result),
        check("the bell holds no mailing notification", list(inbox.body, "results").every((row) => !text(row, "title").startsWith("$dms_mailing.")), inbox.body),
        check("the five hard bounces suppressed nobody", (await suppressionRows(ctx)).length === 0, "listed"),
      ]);
    },
  },
];
