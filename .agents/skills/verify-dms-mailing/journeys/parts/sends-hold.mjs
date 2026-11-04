import { calling, check, TENANT } from "../../mailing.mjs";
import { attributeOf, pageText, wait } from "./browser-kit.mjs";
import { listedAmong, openSends, waitForText } from "./sends-kit.mjs";
import { ago, declareTemplates, importSends, sendOf } from "./ui-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const FIRST = ["hold1@h.test", "hold2@h.test"];
const SEARCH = { role: "textbox", name: "Recipient, slug or send id" };
const LIVE_REFRESH_MS = 9000;

export const journeys = [
  {
    id: "a-search-and-pause-hold-the-rows-behind-a-new-sends-strip",
    title: "a new send waits behind a 'N new sends' strip while a search narrows the log or the page is paused, Show adds it, and Pause is the choice the Overview shares",
    entryPoint: "/modules/mailing/sends, /modules/mailing/overview",
    async run(/** @type {Ctx} */ ctx) {
      await declareTemplates(ctx, [{ slug: "order", category: "orders" }]);
      await importSends(ctx, "two sends", FIRST.map((to, index) => sendOf(`h${index}`, "order", to, ago(0, 1 + index), [{ type: "delivered" }])));
      const tab = await openSends(ctx);
      const all = [...FIRST, "hold3@h.test", "hold4@h.test", "hold5@h.test", "hold6@h.test"];
      const send = async (/** @type {string} */ to) => calling(ctx, `send to ${to}`, "send", ["order", { tenantId: TENANT, to }]);
      const pressed = async (/** @type {string} */ name) => (await attributeOf(tab, { role: "button", name, exact: true }, "aria-pressed")) === "true";

      await tab.click({ role: "button", name: "Open search" });
      await tab.fill(SEARCH, "hold");
      await waitForText(tab, /Send log 2 /);
      await send("hold4@h.test");
      await wait(tab, LIVE_REFRESH_MS);
      const searching = await pageText(tab);
      await ctx.verify("a search narrowing the log holds its rows", [
        check("hold4 is not in the log yet", !searching.includes("hold4@h.test"), (await listedAmong(tab, all)).join()),
        check("the strip counts 1 new send", /1 new send(?!s)/.test(searching), searching.slice(0, 200)),
        check("the table says it is on hold because a search is active", /Table on hold · search active/.test(searching), searching.slice(0, 200)),
      ]);
      await tab.click({ role: "button", name: "Show", exact: true });
      const shown = await waitForText(tab, /hold4@h\.test/);
      await ctx.verify("Show adds the waiting row", [
        check("hold4 is in the log", shown.includes("hold4@h.test"), (await listedAmong(tab, all)).join()),
        check("the strip is gone", !/\d+ new sends?/.test(shown), shown.slice(0, 200)),
      ]);

      await tab.fill(SEARCH, "");
      await waitForText(tab, /Send log 3 /);
      await tab.click({ role: "row", name: /(^| )hold1@h\.test/ });
      await send("hold6@h.test");
      await wait(tab, LIVE_REFRESH_MS);
      const opened = await pageText(tab);
      await ctx.verify("a send open in the drawer holds the rows", [
        check("hold6 is not in the log yet", !opened.includes("hold6@h.test") || opened.indexOf("hold6@h.test") > opened.indexOf("Copy JSON"), (await listedAmong(tab, all)).join()),
      ]);
      await tab.press("Escape");
      await tab.click({ role: "button", name: "Pause", exact: true });
      const paused = await pressed("Pause");
      await send("hold5@h.test");
      await wait(tab, LIVE_REFRESH_MS);
      const frozen = await pageText(tab);
      await ctx.verify("Pause holds the whole page", [
        check("Pause is pressed", paused, "Pause"),
        check("hold5 is not in the log", !frozen.includes("hold5@h.test"), (await listedAmong(tab, all)).join()),
        check("the strip counts 1 new send", /1 new send(?!s)/.test(frozen), frozen.slice(0, 200)),
      ]);
      await tab.goto("/modules/mailing/overview");
      await wait(tab, 3000);
      await ctx.verify("the Overview shares the choice", [check("Pause is pressed on the Overview", await pressed("Pause"), "Pause")]);
      await tab.click({ role: "button", name: "Live", exact: true });
      await tab.goto("/modules/mailing/sends");
      await waitForText(tab, /Send log \d+/);
      await ctx.verify("and Live is shared back", [check("Live is pressed on the Sends page", await pressed("Live"), "Live")]);
    },
  },
  {
    id: "in-live-mode-a-new-send-appears-without-a-strip",
    title: "with nothing open, scrolled or searched, a new send appears in the log by itself in Live mode",
    entryPoint: "/modules/mailing/sends",
    async run(/** @type {Ctx} */ ctx) {
      await declareTemplates(ctx, [{ slug: "order", category: "orders" }]);
      await importSends(ctx, "one send", [sendOf("l0", "order", "hold1@h.test", ago(0, 1), [{ type: "delivered" }])]);
      const tab = await openSends(ctx);
      await calling(ctx, "send while live", "send", ["order", { tenantId: TENANT, to: "live1@h.test" }]);
      await wait(tab, LIVE_REFRESH_MS);
      const text = await waitForText(tab, /live1@h\.test/);
      await ctx.verify("a new send appears in Live mode", [
        check("the row is in the log", text.includes("live1@h.test"), (await listedAmong(tab, ["hold1@h.test", "live1@h.test"])).join()),
        check("no strip waits", !/\d+ new sends?/.test(text), text.slice(0, 200)),
      ]);
    },
  },
];
