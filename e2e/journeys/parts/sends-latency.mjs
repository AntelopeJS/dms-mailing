import { guarded } from "../../guard.mjs";
import { check, mailing, pick, text, withConfig } from "../../mailing.mjs";
import { declareLive, sendCode, sendDetail } from "./api-kit.mjs";
import { openSends, waitForText } from "./sends-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const PROVIDER = "Latency Probe";
const DAY_MS = 86_400_000;

/** The delay each send asks of the verification provider through its recipient, in the order the sends are made. */
const DELAYS_MS = [900, 100, 1500, 300, 150];
const MEDIAN_FLOOR_MS = 280;
const MEDIAN_CEILING_MS = 400;
const EARLY_TIMER_MS = 20;
const SEND_JITTER_MS = 150;

export const journeys = guarded([
  {
    id: "the-median-latency-is-the-middle-api-call-of-the-period",
    title: "five sends the provider answers after 900, 100, 1500, 300 and 150 ms give a median latency of about 300 ms in the stats and the strip: the middle value, not the mean (590), the longest, the shortest or the middle of the send order",
    entryPoint: "GET /api/mailing/sends/stats, /modules/mailing/sends",
    async run(/** @type {Ctx} */ ctx) {
      await withConfig(ctx, { VERIFY_MAILING_PROVIDER: "fake", VERIFY_MAILING_PROVIDER_NAME: PROVIDER }, async () => {
        const template = await declareLive(ctx, "latency-order");
        /** @type {number[]} */
        const stored = [];
        for (const delay of DELAYS_MS) {
          const sent = await sendCode(ctx, `send to a recipient the provider answers after ${delay} ms`, template.slug, { to: `delay-${delay}@latency.test` });
          const detail = await sendDetail(ctx, text(sent.result, "sendId"));
          const latency = Number(pick(detail.send, "latencyMs"));
          stored.push(latency);
          await ctx.verify(`the send answered after ${delay} ms is timed`, [
            check("it is sent through the verification provider", sent.ok && text(sent.result, "status") === "sent", sent.result ?? sent.error),
            check(`its API latency is the delay asked, give or take the timer`, latency >= delay - EARLY_TIMER_MS && latency < delay + SEND_JITTER_MS, latency),
          ]);
        }
        const middle = [...stored].sort((left, right) => left - right)[Math.floor(stored.length / 2)];
        const query = `?from=${encodeURIComponent(new Date(Date.now() - DAY_MS).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}&comparison=none`;
        const stats = await mailing(ctx, "stat strip over the last day", "GET", `/sends/stats${query}`);
        const median = Number(pick(stats.body, "latencyMedian"));
        await ctx.verify("the stats state the middle latency", [
          check("five real sends in the period", pick(stats.body, "sends") === 5, pick(stats.body, "sends")),
          check(`latencyMedian is the third of the five sorted latencies (${middle} ms), the one asked 300 ms`, median === middle, [median, stored]),
          check(`it lies between ${MEDIAN_FLOOR_MS} and ${MEDIAN_CEILING_MS} ms: not the mean, the longest, the shortest, the middle of the send order, nor a text-sorted middle`, median >= MEDIAN_FLOOR_MS && median < MEDIAN_CEILING_MS, median),
        ]);
        const tab = await openSends(ctx);
        const strip = await waitForText(tab, /MEDIAN LATENCY \d+ ms/);
        const shown = Number(/MEDIAN LATENCY (\d+) ms/.exec(strip)?.[1]);
        await ctx.verify("the strip words it", [
          check("MEDIAN LATENCY states the same number of milliseconds", shown === median, strip.slice(strip.indexOf("MEDIAN LATENCY"), strip.indexOf("Send log"))),
          check("it names the provider whose call it times", strip.includes(`API call to ${PROVIDER}`), strip.slice(strip.indexOf("MEDIAN LATENCY"), strip.indexOf("Send log"))),
        ]);
      });
    },
  },
]);
