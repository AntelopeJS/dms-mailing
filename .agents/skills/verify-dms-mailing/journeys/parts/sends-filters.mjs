import { check } from "../../mailing.mjs";
import { wait } from "./browser-kit.mjs";
import { listedAmong, openSends, waitForText } from "./sends-kit.mjs";
import { ago, declareTemplates, importSends, sendOf, testOf } from "./ui-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */
/** @typedef {import("../../mailing.mjs").Tab} Tab */

const ADDRESSES = ["o1@f.test", "o2@f.test", "ot@f.test", "w1@f.test", "wt@f.test"];

/**
 * @param {Tab} tab The tab on the Sends page
 * @param {string} filter The quick filter: Template or Test sends
 * @param {string} option The menu item to check
 * @returns {Promise<void>}
 */
async function pick(tab, filter, option) {
  await tab.click({ role: "button", name: filter });
  await tab.click({ role: "menuitemcheckbox", name: option, exact: true });
  await tab.press("Escape");
  await wait(tab, 1500);
}

export const journeys = [
  {
    id: "the-template-and-test-sends-filters-narrow-the-log",
    title: "the Template filter keeps one template's sends, the Test sends filter keeps the tests or the real sends, and both together keep the intersection",
    entryPoint: "/modules/mailing/sends, Template, Test sends",
    async run(/** @type {Ctx} */ ctx) {
      await declareTemplates(ctx, [
        { slug: "order", category: "orders" },
        { slug: "welcome", category: "account" },
      ]);
      await importSends(ctx, "two templates, real and test sends", [
        sendOf("f1", "order", "o1@f.test", ago(0, 1), [{ type: "delivered" }]),
        sendOf("f2", "order", "o2@f.test", ago(0, 2), [{ type: "delivered" }]),
        testOf("f3", "order", "ot@f.test", ago(0, 3), [{ type: "delivered" }]),
        sendOf("f4", "welcome", "w1@f.test", ago(0, 4), [{ type: "delivered" }]),
        testOf("f5", "welcome", "wt@f.test", ago(0, 5), [{ type: "delivered" }]),
      ]);
      const tab = await openSends(ctx);
      /** @param {string[]} expected The addresses the log must list, and no other of the five */
      const listed = async (expected) => {
        const count = expected.length;
        const text = await waitForText(tab, new RegExp(`Send log ${count} (?!\\d)`));
        const rows = await listedAmong(tab, ADDRESSES);
        return { text, rows, ok: JSON.stringify([...rows].sort()) === JSON.stringify([...expected].sort()) && new RegExp(`Send log ${count} `).test(text) };
      };
      const all = await listed(ADDRESSES);
      await ctx.verify("the unfiltered log lists the five sends", [check("five sends", all.ok, all.rows)], { critical: true });
      await pick(tab, "Template", "welcome");
      const welcome = await listed(["w1@f.test", "wt@f.test"]);
      await ctx.verify("Template = welcome", [check("exactly the two welcome sends, counted 2", welcome.ok, welcome.rows)]);
      await pick(tab, "Template", "order");
      const order = await listed(["o1@f.test", "o2@f.test", "ot@f.test"]);
      await ctx.verify("Template = order", [check("exactly the three order sends, counted 3", order.ok, order.rows)]);
      await pick(tab, "Test sends", "Yes");
      const orderTests = await listed(["ot@f.test"]);
      await ctx.verify("Template = order and Test sends = Yes", [check("only the order test send", orderTests.ok, orderTests.rows)]);
      await pick(tab, "Test sends", "No");
      const orderReal = await listed(["o1@f.test", "o2@f.test"]);
      await ctx.verify("Template = order and Test sends = No", [check("only the two real order sends", orderReal.ok, orderReal.rows)]);
      await pick(tab, "Template", "All");
      const real = await listed(["o1@f.test", "o2@f.test", "w1@f.test"]);
      await ctx.verify("Test sends = No alone", [check("the three real sends", real.ok, real.rows)]);
      await pick(tab, "Test sends", "Yes");
      const tests = await listed(["ot@f.test", "wt@f.test"]);
      await ctx.verify("Test sends = Yes alone", [check("the two test sends", tests.ok, tests.rows)]);
      await pick(tab, "Test sends", "All");
      const back = await listed(ADDRESSES);
      await ctx.verify("All clears the filter", [check("five sends again", back.ok, back.rows)]);
    },
  },
];
