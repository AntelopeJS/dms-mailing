import { guarded } from "../../guard.mjs";
import { calling, check, TENANT } from "../../mailing.mjs";
import { attributeOf, pageText, wait } from "./browser-kit.mjs";
import { ago, declareTemplates, importSends, sendOf } from "./ui-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const OVERVIEW = "/modules/mailing/overview";

export const journeys = guarded([
  {
    id: "overview-live-mode-refreshes-figures-and-pause-freezes-them",
    title: "in Live mode the figures refresh as e-mails are sent, Pause freezes them and the L key switches the mode",
    entryPoint: "/modules/mailing/overview",
    async run(/** @type {Ctx} */ ctx) {
      await declareTemplates(ctx, [{ slug: "order", category: "orders" }]);
      await importSends(ctx, "one send", [sendOf("l1", "order", "a@one.test", ago(1), [{ type: "delivered" }])]);
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto(OVERVIEW);
      const sendsText = async () => ((await pageText(tab)).match(/SENDS (\d+)/) ?? [])[1];
      const until = async (/** @type {string} */ value) => {
        for (let attempt = 0; attempt < 40; attempt += 1) {
          if ((await sendsText()) === value) return true;
          await wait(tab, 500);
        }
        return false;
      };
      await until("1");
      const pressed = async (/** @type {string} */ name) => (await attributeOf(tab, { role: "button", name, exact: true }, "aria-pressed")) === "true";
      const livePressed = await pressed("Live");
      await calling(ctx, "send while live", "send", ["order", { tenantId: TENANT, to: "b@one.test" }]);
      const live = { pass: await until("2"), detail: "" };
      await ctx.verify("Live is the default and refreshes the cards without a reload", [
        check("Live is pressed on opening", livePressed, "Live"),
        check("a new send appears in the Sends figure", live.pass, `Sends shows ${await sendsText()}`),
      ]);
      await tab.click({ role: "button", name: "Pause", exact: true });
      const paused = await pressed("Pause");
      await calling(ctx, "send while paused", "send", ["order", { tenantId: TENANT, to: "c@one.test" }]);
      await wait(tab, 8000);
      const frozen = await sendsText();
      await ctx.verify("Pause freezes the figures", [
        check("Pause is pressed", paused, "Pause"),
        check("the Sends figure stays 2 while a third send happened", frozen === "2", frozen),
      ]);
      await tab.click({ role: "button", name: "Live", exact: true });
      const resumed = { pass: await until("3"), detail: "" };
      await ctx.verify("resuming brings the figures up to date", [check("the Sends figure reads 3", resumed.pass, `Sends shows ${await sendsText()}`)]);
      await tab.click({ role: "heading", name: "Overview", level: 1 });
      await tab.press("l");
      const afterL = await pressed("Pause");
      await tab.press("l");
      const afterLL = await pressed("Live");
      await ctx.verify("the L key switches between the two modes", [
        check("L pauses", afterL, "Pause"),
        check("L again resumes", afterLL, "Live"),
      ]);
    },
  },
]);
