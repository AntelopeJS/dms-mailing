import { check } from "../../mailing.mjs";
import { dialogText, wait } from "./browser-kit.mjs";
import { openSends } from "./sends-kit.mjs";
import { ago, declareTemplates, importSends, sendOf } from "./ui-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */
/** @typedef {import("../../mailing.mjs").Tab} Tab */

const TOTAL = 51;

/**
 * @param {number} index 1 to TOTAL
 * @returns {string} The recipient of that send
 */
const who = (index) => `pg${String(index).padStart(2, "0")}@p.test`;

/**
 * @param {Tab} tab The tab with a drawer open
 * @param {string} address The recipient the drawer must be headed by
 * @returns {Promise<string>} The drawer's text
 */
async function drawerOf(tab, address) {
  let found = "";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    found = await dialogText(tab).catch(() => "");
    if (found.startsWith(`${address} · order`)) return found;
    await wait(tab, 400);
  }
  return found;
}

export const journeys = [
  {
    id: "j-and-k-step-across-the-pages-of-the-log",
    title: "with 51 sends the log holds 50 per page, J on the 50th send opens the 51st from the next page as 'Send 51 of 51', and K goes back to 'Send 50 of 51'",
    entryPoint: "/modules/mailing/sends",
    async run(/** @type {Ctx} */ ctx) {
      await declareTemplates(ctx, [{ slug: "order", category: "orders" }]);
      await importSends(ctx, "51 sends", Array.from({ length: TOTAL }, (_, offset) => sendOf(`pg${offset + 1}`, "order", who(offset + 1), ago(0, 0.01 * (offset + 1)), [{ type: "delivered" }])));
      const tab = await openSends(ctx);
      await tab.click({ role: "row", name: new RegExp(`(^| )${who(50).replace(".", "\\.")}`) });
      const fiftieth = await drawerOf(tab, who(50));
      await ctx.verify("the 50th send is the last row of the first page", [check("Send 50 of 51", /Send 50 of 51 /.test(fiftieth), fiftieth.slice(0, 100))]);
      await tab.press("j");
      const last = await drawerOf(tab, who(51));
      await ctx.verify("J crosses to the next page", [
        check("the drawer is headed by the 51st send", last.startsWith(`${who(51)} · order`), last.slice(0, 80)),
        check("Send 51 of 51", /Send 51 of 51 /.test(last), last.slice(0, 100)),
      ]);
      await tab.press("k");
      const back = await drawerOf(tab, who(50));
      await ctx.verify("K goes back across the pages", [check("Send 50 of 51", /Send 50 of 51 /.test(back), back.slice(0, 100))]);
      await tab.press("j");
      await drawerOf(tab, who(51));
      await tab.press("j");
      await wait(tab, 1500);
      const end = await dialogText(tab);
      await ctx.verify("J on the last send stays on it", [check("Send 51 of 51", /Send 51 of 51 /.test(end), end.slice(0, 100))]);
    },
  },
];
