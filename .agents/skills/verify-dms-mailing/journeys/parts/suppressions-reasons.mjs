import { check, text } from "../../mailing.mjs";
import { declareLive, entryOf, importSends, postEvent, secretOf, suppressionRows } from "./api-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

/**
 * @typedef {{ name: string, type: string, details?: Record<string, unknown>, isTest?: boolean, reason: string | null }} Case
 */

/** What each provider event does to the list: the reason it adds, or null when the address stays off. */
/** @type {Case[]} */
const CASES = [
  { name: "hard bounce type hard", type: "bounced", details: { bounceType: "hard", reason: "550 5.1.1 No such user" }, reason: "hard_bounce" },
  { name: "bounce type permanent", type: "bounced", details: { bounceType: "permanent" }, reason: "hard_bounce" },
  { name: "bounce without a type, answer 550", type: "bounced", details: { reason: "550 5.1.1 No such user" }, reason: "hard_bounce" },
  { name: "bounce without any detail", type: "bounced", reason: "hard_bounce" },
  { name: "bounce type hard wins over a 4xx answer", type: "bounced", details: { bounceType: "hard", reason: "421 4.7.0 busy" }, reason: "hard_bounce" },
  { name: "bounce type soft", type: "bounced", details: { bounceType: "soft", reason: "550 mailbox" }, reason: null },
  { name: "bounce type transient", type: "bounced", details: { bounceType: "transient" }, reason: null },
  { name: "bounce type temporary", type: "bounced", details: { bounceType: "temporary" }, reason: null },
  { name: "bounce without a type, answer 452", type: "bounced", details: { reason: "452 4.2.2 Mailbox full" }, reason: null },
  { name: "bounce without a type, enhanced code 4.2.2", type: "bounced", details: { reason: "Mailbox full 4.2.2" }, reason: null },
  { name: "spam complaint", type: "spam", reason: "complaint" },
  { name: "unsubscription", type: "unsubscribed", reason: "unsubscribe" },
  { name: "failed", type: "failed", details: { reason: "provider failure" }, reason: null },
  { name: "delivered", type: "delivered", reason: null },
  { name: "opened", type: "opened", reason: null },
  { name: "clicked", type: "clicked", reason: null },
  { name: "queued", type: "queued", reason: null },
  { name: "sent", type: "sent", reason: null },
  { name: "test send, hard bounce", type: "bounced", details: { bounceType: "hard" }, isTest: true, reason: "hard_bounce" },
  { name: "test send, spam complaint", type: "spam", isTest: true, reason: null },
  { name: "test send, unsubscription", type: "unsubscribed", isTest: true, reason: null },
  { name: "test send, soft bounce", type: "bounced", details: { bounceType: "soft" }, isTest: true, reason: null },
];

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
export const reasons = {
  id: "provider-events-put-an-address-on-the-list-only-when-nothing-more-must-reach-it",
  title: "a permanent bounce, a spam complaint and an unsubscription suppress the address with the right reason, a temporary bounce and every other event do not, and a test send only suppresses on a permanent bounce",
  entryPoint: "POST /api/mailing/events/:provider/:tenantId",
  async run(ctx) {
    const template = await declareLive(ctx, "reasons-order");
    const secret = await secretOf(ctx);
    const sentAt = { $date: new Date(Date.now() - 600_000).toISOString() };
    const prepared = CASES.map((entry, index) => ({ entry, email: ctx.email(`case${index}`), messageId: `reason-${index}` }));
    const imported = await importSends(
      ctx,
      "import one send per case",
      prepared.map(({ entry, email, messageId }) => ({ importId: messageId, templateSlug: template.slug, to: { email }, sentAt, providerMessageId: messageId, isTest: entry.isTest === true })),
    );
    await ctx.verify("the sends exist", [check("every case has a send", imported.ids.length === CASES.length, imported.result ?? imported.error)], { critical: true });
    for (const [index, { entry, email, messageId }] of prepared.entries()) {
      const posted = await postEvent(ctx, `post ${entry.name}`, { secret, body: { messageId, type: entry.type, details: entry.details } });
      const rows = await suppressionRows(ctx);
      const found = entryOf(rows, email);
      await ctx.verify(`${entry.name}: ${entry.reason ?? "the address stays off the list"}`, [
        check("the webhook records the event", posted.status === 200 && /** @type {{ recorded?: unknown }} */ (posted.json).recorded === true, posted.text),
        check(entry.reason ? `the entry has the reason ${entry.reason}` : "no entry for the address", entry.reason ? text(found, "reason") === entry.reason : found === undefined, found ?? "no entry"),
        ...(entry.reason ? [check("the entry points at the send", text(found, "sendId") === imported.ids[index], found?.sendId)] : []),
        ...(entry.reason && entry.details?.reason ? [check("the entry keeps the provider's words as its detail", text(found, "detail") === entry.details.reason, found?.detail)] : []),
      ]);
    }

    const first = ctx.email("first-reason");
    const twice = await importSends(ctx, "import two sends to one address", [
      { importId: "twice-1", templateSlug: template.slug, to: { email: first }, sentAt, providerMessageId: "twice-1" },
      { importId: "twice-2", templateSlug: template.slug, to: { email: first }, sentAt, providerMessageId: "twice-2" },
    ]);
    await postEvent(ctx, "a spam complaint on the first send", { secret, body: { messageId: "twice-1", type: "spam" } });
    await postEvent(ctx, "a hard bounce on the second send", { secret, body: { messageId: "twice-2", type: "bounced", details: { bounceType: "hard" } } });
    const kept = entryOf(await suppressionRows(ctx), first);
    await ctx.verify("an address already on the list keeps its first reason", [
      check("still a spam complaint", text(kept, "reason") === "complaint", kept),
      check("still pointing at the first send", text(kept, "sendId") === twice.ids[0], kept?.sendId),
    ]);
  },
};
