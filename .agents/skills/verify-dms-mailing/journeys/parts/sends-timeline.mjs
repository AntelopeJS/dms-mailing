import { check, pick, text } from "../../mailing.mjs";
import { dialogText, wait } from "./browser-kit.mjs";
import { declareLive, postEvent, secretOf, sendCode } from "./api-kit.mjs";
import { openSends } from "./sends-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const AGENT = "Mozilla/5.0 Probe";
const LINK = "https://shop.example.com/p/1";
const REASON = "550 5.7.1 Probe reason";

export const journeys = [
  {
    id: "the-timeline-shows-the-url-and-the-user-agent-of-open-and-click-events",
    title: "the timeline of a send shows the user agent on its Opened step and the link on its Clicked step, and the provider's reason before them when an event carries both",
    entryPoint: "POST /api/mailing/events/<provider>/<tenant>, /modules/mailing/sends",
    async run(/** @type {Ctx} */ ctx) {
      await declareLive(ctx, "timeline-order", { variables: [] });
      const secret = await secretOf(ctx);
      const to = ctx.email("timeline");
      const sent = await sendCode(ctx, "send", "timeline-order", { to: { email: to } });
      const messageId = text(sent.result, "messageId");
      const post = async (/** @type {string} */ type, /** @type {Record<string, unknown>} */ details) => {
        const answer = await postEvent(ctx, `post ${type}`, { secret, body: { messageId, type, details } });
        return pick(answer.json, "recorded") === true;
      };
      const recorded = [await post("delivered", {}), await post("opened", { userAgent: AGENT }), await post("clicked", { url: LINK }), await post("clicked", { url: LINK, reason: REASON })];
      await ctx.verify("the events are recorded", [check("four events", recorded.every(Boolean), recorded)], { critical: true });
      const tab = await openSends(ctx);
      await tab.click({ role: "row", name: new RegExp(`(^| )${to.replace(/[.+]/g, "\\$&")}`) });
      let drawer = "";
      for (let attempt = 0; attempt < 40 && !drawer.includes("TIMELINE"); attempt += 1) {
        drawer = await dialogText(tab).catch(() => "");
        await wait(tab, 400);
      }
      const timeline = drawer.slice(drawer.indexOf("TIMELINE"));
      const stepsOf = (/** @type {string} */ label) => [...timeline.matchAll(new RegExp(`${label} (\\S[^]*?)(?= \\d\\d:\\d\\d:\\d\\d|$| ORIGIN)`, "g"))].map((match) => String(match[1]).trim());
      await ctx.verify("the timeline words the details", [
        check("the Opened step carries the user agent", JSON.stringify(stepsOf("Opened")) === JSON.stringify([AGENT]), stepsOf("Opened")),
        check("the Clicked steps carry the link, then the reason alone", JSON.stringify(stepsOf("Clicked")) === JSON.stringify([LINK, REASON]), stepsOf("Clicked")),
        check("the link of the step that has a reason is not shown", timeline.split(LINK).length === 2, timeline.slice(0, 400)),
      ]);
    },
  },
];
