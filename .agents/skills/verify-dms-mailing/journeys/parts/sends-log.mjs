import { guarded } from "../../guard.mjs";
import { calling, check, mailing, pick, TENANT, text } from "../../mailing.mjs";
import { attributeOf, pageText, wait } from "./browser-kit.mjs";
import { D, listedAmong, openSends, seedLog, waitForText, WHO } from "./sends-kit.mjs";
import { DAY_MS, declareTemplates, importSends, ago, sendOf } from "./ui-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */
/** @typedef {import("../../mailing.mjs").Row} Row */

const ADDRESSES = Object.values(WHO);

const PREVIOUS = ["p1@two.test", "p2@two.test", "p3@two.test", "p4@two.test", "p5@two.test", "p6@two.test", "p7@two.test"];

const TABS = [
  { name: "All", count: 21, shows: [...ADDRESSES, ...PREVIOUS] },
  { name: "Problems", count: 5, shows: [WHO.hard, WHO.soft, WHO.failed, WHO.spam, "p4@two.test"] },
  { name: "In progress", count: 4, shows: [WHO.queued, WHO.sent, "p5@two.test", "p6@two.test"] },
  { name: "Delivered, not opened", count: 6, shows: [WHO.delivered, WHO.german, WHO.test, "p1@two.test", "p2@two.test", "p7@two.test"] },
  { name: "Opened or clicked", count: 3, shows: [WHO.opened, WHO.clicked, "p3@two.test"] },
  { name: "Unsubscribed", count: 1, shows: [WHO.unsubscribed] },
  { name: "Suppressed", count: 1, shows: [WHO.suppressed] },
];

export const journeys = guarded([
  {
    id: "stat-strip-states-the-period-figures-and-their-changes",
    title: "the stat strip counts real sends, delivered, problems, the queue and the median latency, compares all but the queue, and leaves test sends out",
    entryPoint: "GET /api/mailing/sends/stats, /modules/mailing/sends",
    async run(/** @type {Ctx} */ ctx) {
      await seedLog(ctx);
      const day = (/** @type {number} */ days) => new Date(Date.now() - days * DAY_MS).toISOString();
      const query = `?from=${encodeURIComponent(day(1))}&to=${encodeURIComponent(new Date().toISOString())}&comparison=previous-period`;
      const stats = await mailing(ctx, "stat strip", "GET", `/sends/stats${query}`);
      const body = stats.body;
      const compared = pick(body, "compared");
      await ctx.verify("the strip counts the 24 hours", [
        check("Sends: 11 real sends (the 2 test sends and the suppressed send are not counted), 2 tests aside", pick(body, "sends") === 11 && pick(body, "tests") === 2, [pick(body, "sends"), pick(body, "tests")]),
        check("Delivered: 6 of 11", pick(body, "delivered") === 6 && Math.abs(Number(pick(body, "deliverability")) - (600 / 11)) < 1e-9, [pick(body, "delivered"), pick(body, "deliverability")]),
        check("Problems: 4 = 2 bounces + 1 failure + 1 spam, tests left out", JSON.stringify([pick(body, "problems"), pick(body, "bounced"), pick(body, "failed"), pick(body, "spam")]) === JSON.stringify([4, 2, 1, 1]), body),
        check("Queued: 1, with the time of the oldest", pick(body, "queued") === 1 && text(body, "oldestQueuedAt") !== "", pick(body, "oldestQueuedAt")),
        check("the compared period: 6 sends, 50% delivered, 1 problem; sends +83.3%", JSON.stringify([pick(compared, "sends"), pick(compared, "deliverability"), pick(compared, "problems"), pick(body, "sendsDelta")]) === JSON.stringify([6, 50, 1, 83.3]), compared),
        check("the strip has five cells, Queued without any comparison", JSON.stringify(Array.isArray(pick(body, "items")) ? /** @type {Row[]} */ (pick(body, "items")).map((item) => item.id) : []) === JSON.stringify(["sends", "delivered", "problems", "queued", "latency"]), pick(body, "items")),
      ]);
      const plain = await mailing(ctx, "stat strip without comparison", "GET", `/sends/stats${query.replace("previous-period", "none")}`);
      await ctx.verify("No comparison removes the compared figures", [check("no compared block and no delta", pick(plain.body, "compared") === null && pick(plain.body, "sendsDelta") === null, [pick(plain.body, "compared"), pick(plain.body, "sendsDelta")])]);

      const tab = await openSends(ctx);
      const strip = await waitForText(tab, /MEDIAN LATENCY/);
      await ctx.verify("the page words the strip", [
        check("Sends 11 with the change, the compared figure and the tests not counted", /SENDS 11 ▲ 83% vs 6 · \+ 2 tests, not counted/.test(strip), strip),
        check("Delivered 55% with its change and 6 of 11", /DELIVERED 55% ▲ 9% vs 50% · 6 of 11/.test(strip), strip),
        check("Problems 4 with its change and the breakdown", /PROBLEMS 4 ▲ 300% vs 1 · 2 bounces · 1 failed · 1 spam/.test(strip), strip),
        check("Queued 1 states the oldest wait and never compares", /QUEUED 1 Oldest queued 9 hours ago MEDIAN LATENCY/.test(strip), strip),
        check("Median latency is stated in ms with the provider", /MEDIAN LATENCY 0 ms (vs 0 ms · )?API call to nodemailer/.test(strip), strip),
        check("the period is 24H by default", (await attributeOf(tab, { role: "radio", name: "Last 24 hours" }, "aria-checked")) === "true" || /24H/.test(strip), strip),
        check("the footnote says the period applies to the figures only", /The period applies to the figures above; the log lists every kept send\./.test(strip), strip),
      ]);
      await tab.click({ role: "button", name: /^Comparison/ });
      await tab.click({ role: "menuitem", name: "No comparison" });
      await wait(tab, 3000);
      const after = await pageText(tab);
      await ctx.verify("No comparison leaves the figures alone", [
        check("no change is stated", /SENDS 11 (?!▲|▼)/.test(after) && !/vs 6/.test(after.slice(after.indexOf("SENDS"), after.indexOf("MEDIAN"))), after),
      ]);
    },
  },
  {
    id: "stage-tabs-hold-their-sends",
    title: "each stage tab lists exactly its sends, with its count; Problems leaves test sends out",
    entryPoint: "/modules/mailing/sends",
    async run(/** @type {Ctx} */ ctx) {
      await seedLog(ctx);
      const tab = await openSends(ctx);
      const everyone = [...ADDRESSES, ...PREVIOUS];
      for (const entry of TABS) {
        await tab.click({ role: "button", name: new RegExp(`^${entry.name} \\d+$`) });
        const text = await waitForText(tab, new RegExp(`Send log ${entry.count} (?!\\d)`));
        const listed = await listedAmong(tab, everyone);
        await ctx.verify(`the ${entry.name} tab`, [
          check(`${entry.name}: ${entry.count} sends`, new RegExp(`Send log ${entry.count} `).test(text), text.slice(text.indexOf("Send log"), text.indexOf("Send log") + 40)),
          check(`${entry.name} lists exactly its sends, and none other`, JSON.stringify([...listed].sort()) === JSON.stringify([...entry.shows].sort()), listed),
        ]);
      }
    },
  },
  {
    id: "locale-column-says-when-the-locale-asked-was-not-sent",
    title: "the Locale column shows the locale sent, and when it differs from the locale asked for, says DE asked",
    entryPoint: "/modules/mailing/sends",
    async run(/** @type {Ctx} */ ctx) {
      await declareTemplates(ctx, [{ slug: "order", category: "orders" }, { slug: "bilingual", locales: ["en", "de"] }]);
      await importSends(ctx, "one old send", [sendOf("o1", "order", "old@one.test", ago(0, 5), [D])]);
      const asked = await calling(ctx, "ask for German of an English-only template", "send", ["order", { tenantId: TENANT, to: "fallback@one.test", locale: "de" }]);
      const plain = await calling(ctx, "ask for English", "send", ["order", { tenantId: TENANT, to: "english@one.test", locale: "en" }]);
      const german = await calling(ctx, "ask for German of a German template", "send", ["bilingual", { tenantId: TENANT, to: "german@one.test", locale: "de" }]);
      await ctx.verify("the sends are made", [check("three sends", asked.ok && plain.ok && german.ok, [asked.error, plain.error, german.error])], { critical: true });
      const tab = await openSends(ctx);
      const row = async (/** @type {string} */ address) => {
        const text = await waitForText(tab, new RegExp(`${address.replace(".", "\\.")} .*?order|${address.replace(".", "\\.")} .*?bilingual`));
        const match = text.match(new RegExp(`${address.replace(/[.+]/g, "\\$&")} (?:Sent|Queued|Failed) (?:[^|]*?)(?:order|bilingual) (EN|DE)( [A-Z]{2} asked)?`));
        return [match?.[1], match?.[2]?.trim()];
      };
      const fallback = await row("fallback@one.test");
      const english = await row("english@one.test");
      const native = await row("german@one.test");
      await ctx.verify("the column shows the locale sent and the fallback", [
        check("English sent for a German ask: EN, DE asked", JSON.stringify(fallback) === JSON.stringify(["EN", "DE asked"]), fallback),
        check("English asked and sent: EN alone", JSON.stringify(english) === JSON.stringify(["EN", undefined]), english),
        check("German asked of a German template: DE alone", JSON.stringify(native) === JSON.stringify(["DE", undefined]), native),
      ]);
    },
  },
]);
