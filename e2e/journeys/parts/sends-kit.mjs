import { calling, check, mailing, TENANT } from "../../mailing.mjs";
import { pageText, wait } from "./browser-kit.mjs";
import { ago, declareTemplates, importSends, sendOf, testOf, withFields } from "./ui-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */
/** @typedef {import("../../mailing.mjs").Tab} Tab */

export const SENDS_PAGE = "/modules/mailing/sends";
export const D = { type: "delivered" };
export const O = { type: "opened" };
export const C = { type: "clicked" };

/** The addresses of the log, by what happened to the send. */
export const WHO = {
  delivered: "ok@one.test",
  opened: "open@one.test",
  clicked: "click@one.test",
  hard: "bounce@one.test",
  soft: "soft@one.test",
  failed: "fail@one.test",
  spam: "spam@one.test",
  unsubscribed: "unsub@one.test",
  queued: "queued@one.test",
  sent: "sent@one.test",
  german: "de@one.test",
  test: "test@one.test",
  testFailure: "testfail@one.test",
  suppressed: "blocked@one.test",
};

/**
 * @returns {Record<string, unknown>[]} The log of the last 24 hours: every status once, two test sends, then an older period
 */
export function logImports() {
  return [
    sendOf("a1", "order", WHO.delivered, ago(0, 2), [D]),
    sendOf("a2", "order", WHO.opened, ago(0, 3), [D, O]),
    sendOf("a3", "order", WHO.hard, ago(0, 4), [{ type: "bounced", details: { reason: "550 5.1.1 Mailbox does not exist" } }]),
    sendOf("a4", "order", WHO.soft, ago(0, 5), [{ type: "bounced", details: { reason: "452 4.2.2 mailbox full", bounceType: "soft" } }]),
    sendOf("a5", "order", WHO.failed, ago(0, 6), [{ type: "failed", details: { reason: "connect ECONNREFUSED" } }]),
    sendOf("a6", "order", WHO.spam, ago(0, 7), [D, { type: "spam" }]),
    sendOf("a7", "order", WHO.unsubscribed, ago(0, 8), [D, { type: "unsubscribed" }]),
    sendOf("a8", "order", WHO.queued, ago(0, 9), [{ type: "queued" }]),
    testOf("a9", "order", WHO.test, ago(0, 10), [D]),
    withFields(sendOf("b1", "order", WHO.german, ago(0, 11), [D]), { locale: "de" }),
    sendOf("b2", "order", WHO.sent, ago(0, 12)),
    sendOf("b3", "order", WHO.clicked, ago(0, 13), [D, O, C]),
    testOf("b4", "order", WHO.testFailure, ago(0, 14), [{ type: "failed", details: { reason: "boom" } }]),
    sendOf("q1", "order", "p1@two.test", ago(1, 6), [D]),
    sendOf("q2", "order", "p2@two.test", ago(1, 7), [D]),
    sendOf("q3", "order", "p3@two.test", ago(1, 8), [D, O]),
    sendOf("q4", "order", "p4@two.test", ago(1, 9), [{ type: "bounced" }]),
    sendOf("q5", "order", "p5@two.test", ago(1, 10)),
    sendOf("q6", "order", "p6@two.test", ago(1, 11)),
    testOf("q7", "order", "p7@two.test", ago(1, 12), [D]),
  ];
}

/**
 * Declares the template, imports the log and suppresses one address with a send to it.
 *
 * @param {Ctx} ctx The journey
 * @returns {Promise<string[]>} The send ids of the imports, in order
 */
export async function seedLog(ctx) {
  await declareTemplates(ctx, [{ slug: "order", category: "orders" }]);
  const ids = await importSends(ctx, "the log", logImports());
  const added = await mailing(ctx, "suppress an address", "POST", "/suppressions", { body: { email: WHO.suppressed } });
  const blocked = await calling(ctx, "send to the suppressed address", "send", ["order", { tenantId: TENANT, to: WHO.suppressed }]);
  await ctx.verify("the suppressed send exists", [check("it is suppressed", added.status === 200 && blocked.ok, blocked.result)], { critical: true });
  return ids;
}

/**
 * Opens the Sends page and waits for the log.
 *
 * @param {Ctx} ctx The journey
 * @returns {Promise<Tab>} The tab, signed in as the administrator, on the page
 */
export async function openSends(ctx) {
  const tab = await ctx.tab();
  await tab.signIn("admin");
  await tab.goto(SENDS_PAGE);
  await waitForText(tab, /Send log \d+/);
  return tab;
}

/**
 * Waits until the page text on one line matches.
 *
 * @param {Tab} tab The tab
 * @param {RegExp} pattern What to wait for
 * @returns {Promise<string>} The text at the end, matching or not
 */
export async function waitForText(tab, pattern) {
  let text = await pageText(tab);
  for (let attempt = 0; attempt < 60 && !pattern.test(text); attempt += 1) {
    await wait(tab, 500);
    text = await pageText(tab);
  }
  return text;
}

/**
 * @param {Tab} tab The tab
 * @param {string[]} addresses The addresses to look for
 * @returns {Promise<string[]>} The ones the page lists, in the order given
 */
export async function listedAmong(tab, addresses) {
  const text = await pageText(tab);
  return addresses.filter((address) => text.includes(address));
}
