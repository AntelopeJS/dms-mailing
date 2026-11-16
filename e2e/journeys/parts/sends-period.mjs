import { check } from "../../mailing.mjs";
import { attributeOrAbsent, pageText, radioNames, wait } from "./browser-kit.mjs";
import { openSends } from "./sends-kit.mjs";
import { ago, declareTemplates, importSends, sendOf } from "./ui-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const RADIOS = ["Last 24 hours", "Last 7 days", "Last 30 days"];

/**
 * 24H is the last 24 hours up to now. 7D and 30D are calendar periods of the reader: from midnight 6 or 29 days
 * before today to the end of today, so their boundaries are read off the clock instead of counted back in hours.
 *
 * @param {number} back Days before today
 * @returns {Date} Midnight of that day, in the reader's time zone
 */
function midnight(back) {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - back);
  return day;
}

/**
 * @param {Date} base A moment
 * @param {number} minutes Minutes later (earlier when negative)
 * @returns {{ $date: string }} The date as the fixture revives it
 */
function around(base, minutes) {
  return { $date: new Date(base.getTime() + minutes * 60_000).toISOString() };
}

/** One send per place around the three boundaries: each period counts the sends inside it and none outside. */
/** @type {[string, { $date: string }][]} */
const AGES = [
  ["in24-a", ago(0, 2)],
  ["in24-b", ago(0, 23.83)],
  ["in7-a", ago(1, 0.17)],
  ["in7-b", ago(3)],
  ["in7-c", around(midnight(6), 10)],
  ["in30-a", around(midnight(6), -10)],
  ["in30-b", ago(20)],
  ["in30-c", around(midnight(29), 10)],
  ["out-a", around(midnight(29), -10)],
  ["out-b", ago(45)],
];

export const journeys = [
  {
    id: "the-sends-period-is-24h-by-default-and-offers-exactly-24h-7d-and-30d",
    title: "the Sends period is 24H by default with no other radio checked, offers exactly 24H, 7D and 30D, and each period counts the sends inside its boundary and none outside",
    entryPoint: "/modules/mailing/sends",
    async run(/** @type {Ctx} */ ctx) {
      await declareTemplates(ctx, [{ slug: "order", category: "orders" }]);
      await importSends(ctx, "the sends of every age", AGES.map(([key, when]) => sendOf(key, "order", `${key}@age.test`, when, [{ type: "delivered" }])));
      const tab = await openSends(ctx);
      const sendsFigure = async () => ((await pageText(tab)).match(/SENDS (\d+)/) ?? [])[1];
      const until = async (/** @type {string} */ value) => {
        for (let attempt = 0; attempt < 40; attempt += 1) {
          if ((await sendsFigure()) === value) return value;
          await wait(tab, 500);
        }
        return sendsFigure();
      };
      const names = await radioNames(tab, /^Last \d+ (hours|days)$/);
      const checked = await Promise.all(RADIOS.map((name) => attributeOrAbsent(tab, { role: "radio", name }, "aria-checked")));
      await ctx.verify("the period options", [
        check("exactly 24 hours, 7 days and 30 days", JSON.stringify(names) === JSON.stringify(RADIOS), names),
        check("24H is checked and the other two are not", JSON.stringify(checked) === '["true","false","false"]', checked),
        check("the default period counts the 2 sends of the last 24 hours", (await until("2")) === "2", await sendsFigure()),
      ]);
      await tab.click({ role: "radio", name: "Last 7 days" });
      const week = await until("5");
      await ctx.verify("7D counts the sends up to 7 days old", [check("5 sends (a send 10 minutes before the first midnight of the period is left out)", week === "5", week)]);
      await tab.click({ role: "radio", name: "Last 30 days" });
      const month = await until("8");
      await ctx.verify("30D counts the sends up to 30 days old", [check("8 sends (a send 10 minutes before the first midnight of the period is left out)", month === "8", month)]);
      await tab.click({ role: "radio", name: "Last 24 hours" });
      const back = await until("2");
      await ctx.verify("24H again", [check("2 sends", back === "2", back)]);
    },
  },
];
