import { guarded } from "../../guard.mjs";
import { calling, check, mailing, pick, TENANT } from "../../mailing.mjs";
import { DAY_MS, ago, declareTemplates, figure, importSends, metric, sendOf, testOf, windowQuery } from "./ui-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const D = { type: "delivered" };
const O = { type: "opened" };
const C = { type: "clicked" };

/**
 * The current 30 days: 8 real sends (5 delivered, 4 opened, 2 clicked, 1 bounce, 1 unsubscribe), a test send, a send to a suppressed address.
 * The 30 days before: 4 sends (2 delivered, 1 opened, 0 clicked, 2 bounces).
 *
 * @returns {Record<string, unknown>[]} The imports
 */
export function window30() {
  return [
    sendOf("c1", "order", "a@one.test", ago(2), [D, O]),
    sendOf("c2", "order", "b@one.test", ago(3), [D, O, C]),
    sendOf("c3", "order", "c@one.test", ago(4), [D, C]),
    sendOf("c4", "order", "d@one.test", ago(5), [{ type: "bounced", details: { reason: "550 5.1.1 Mailbox does not exist" } }]),
    sendOf("c5", "order", "e@one.test", ago(6), [D, O, { type: "unsubscribed" }]),
    sendOf("c6", "order", "f@one.test", ago(7), [D, { type: "spam" }]),
    sendOf("c7", "order", "g@one.test", ago(8), [{ type: "failed", details: { reason: "connect ECONNREFUSED" } }]),
    sendOf("c8", "order", "h@one.test", ago(9), [{ type: "sent" }]),
    testOf("c9", "order", "t@one.test", ago(2), [D, O, C]),
    sendOf("p1", "order", "a@two.test", ago(35), [D, O]),
    sendOf("p2", "order", "b@two.test", ago(36), [D]),
    sendOf("p3", "order", "c@two.test", ago(37), [{ type: "bounced" }]),
    sendOf("p4", "order", "d@two.test", ago(38), [{ type: "bounced" }]),
    testOf("p5", "order", "t@two.test", ago(36), [D, O, C]),
  ];
}

export const journeys = guarded([
  {
    id: "kpis-count-the-right-sends",
    title: "the six KPIs count real sends only, state exact figures and changes against the previous period",
    entryPoint: "GET /api/mailing/metrics/kpi/:metric, /modules/mailing",
    async run(/** @type {Ctx} */ ctx) {
      await declareTemplates(ctx, [{ slug: "order", category: "orders" }]);
      await importSends(ctx, "two windows", window30());
      const suppress = await mailing(ctx, "suppress an address", "POST", "/suppressions", { body: { email: "blocked@one.test" } });
      const blocked = await calling(ctx, "send to the suppressed address", "send", ["order", { tenantId: TENANT, to: "blocked@one.test" }]);
      await ctx.verify("a suppressed send exists", [
        check("the address is added", suppress.status === 200, suppress.body),
        check("the send is suppressed", pick(blocked.result, "status") === "suppressed", blocked.result),
      ], { critical: true });
      const query = windowQuery(30);
      const read = async (/** @type {string} */ id, /** @type {string} */ q = query) => figure(await metric(ctx, `/kpi/${id}${q}`));
      const [sends, deliverability, openRate, clickRate, bounces, unsubscribes] = await Promise.all(
        ["sends", "deliverability", "open-rate", "click-rate", "bounces", "unsubscribes"].map((id) => read(id)),
      );
      await ctx.verify("the six KPIs state the figures of the 30 days against the 30 before", [
        check("Sends: 8 against 4, +100%; test and suppressed sends are left out", JSON.stringify(sends) === JSON.stringify([8, 4, 100]), sends),
        check("Deliverability: 5 of 8 delivered (62.5) against 2 of 4 (50), +25%", JSON.stringify(deliverability) === JSON.stringify([62.5, 50, 25]), deliverability),
        check("Open rate: 4 opened of 5 delivered (80, a click without an open counts as opened) against 50, +60%", JSON.stringify(openRate) === JSON.stringify([80, 50, 60]), openRate),
        check("Click rate: 2 of 5 delivered (40); the previous 0 states no change", JSON.stringify(clickRate) === JSON.stringify([40, 0, "absent"]), clickRate),
        check("Bounces: 1 against 2, -50%", JSON.stringify(bounces) === JSON.stringify([1, 2, -50]), bounces),
        check("Unsubscribes: 1 against 0, no change stated", JSON.stringify(unsubscribes) === JSON.stringify([1, 0, "absent"]), unsubscribes),
      ]);
      const sparkline = pick(await metric(ctx, `/kpi/sends${query}`), "sparkline");
      await ctx.verify("a KPI carries its own daily trend", [
        check("the sparkline has one point per day of the window and sums to the figure", Array.isArray(sparkline) && sparkline.length === 30 && sparkline.map(Number).reduce((sum, point) => sum + point, 0) === 8, sparkline),
      ]);
      const none = await read("sends", windowQuery(30, "none"));
      const unknown = await mailing(ctx, "an unknown KPI", "GET", `/metrics/kpi/nonsense${query}`);
      await ctx.verify("No comparison removes the changes; an unknown KPI is refused", [
        check("No comparison: the figure only", JSON.stringify(none) === JSON.stringify([8, "absent", "absent"]), none),
        check("an unknown KPI answers 404", unknown.status === 404, unknown.status),
      ]);
    },
  },
  {
    id: "engagement-outlives-the-final-status",
    title: "a send opened or clicked and then unsubscribed or reported as spam still counts as opened and clicked",
    entryPoint: "GET /api/mailing/metrics/kpi/*",
    async run(/** @type {Ctx} */ ctx) {
      await declareTemplates(ctx, [{ slug: "order", category: "orders" }]);
      await importSends(ctx, "engaged then left", [
        sendOf("e1", "order", "a@one.test", ago(2), [D, O, C, { type: "unsubscribed" }]),
        sendOf("e2", "order", "b@one.test", ago(3), [D, C, { type: "spam" }]),
        sendOf("e3", "order", "c@one.test", ago(4), [D]),
      ]);
      const query = windowQuery(30, "none");
      const read = async (/** @type {string} */ id) => pick(await metric(ctx, `/kpi/${id}${query}`), "value");
      const [deliverability, openRate, clickRate, unsubscribes] = await Promise.all(["deliverability", "open-rate", "click-rate", "unsubscribes"].map(read));
      await ctx.verify("engagement survives the final status", [
        check("Deliverability 100: unsubscribed and spam sends were delivered", deliverability === 100, deliverability),
        check("Open rate 2 of 3: the click without an open counts as opened", Math.abs(Number(openRate) - 66.66666666666667) < 1e-9, openRate),
        check("Click rate 2 of 3", Math.abs(Number(clickRate) - 66.66666666666667) < 1e-9, clickRate),
        check("Unsubscribes 1", unsubscribes === 1, unsubscribes),
      ]);
    },
  },
  {
    id: "default-period-is-30-days-compared-with-the-previous-period",
    title: "without a window the KPIs read the last 30 days, compared by default; periods of 7 and 90 days select their own sends",
    entryPoint: "GET /api/mailing/metrics/kpi/sends",
    async run(/** @type {Ctx} */ ctx) {
      await declareTemplates(ctx, [{ slug: "order", category: "orders" }]);
      await importSends(ctx, "ages", [
        sendOf("d5", "order", "a@one.test", ago(5), [D]),
        sendOf("d20", "order", "b@one.test", ago(20), [D]),
        sendOf("d29", "order", "c@one.test", ago(29), [D]),
        sendOf("d31", "order", "d@one.test", ago(31), [D]),
        sendOf("d45", "order", "e@one.test", ago(45), [D]),
        sendOf("d70", "order", "f@one.test", ago(70), [D]),
        sendOf("d85", "order", "g@one.test", ago(85), [D]),
      ]);
      const bare = figure(await metric(ctx, "/kpi/sends"));
      const week = figure(await metric(ctx, `/kpi/sends${windowQuery(7)}`));
      const quarter = figure(await metric(ctx, `/kpi/sends${windowQuery(90)}`));
      await ctx.verify("the windows select their own sends", [
        check("default window: 3 sends in 30 days, 2 in the 30 before, +50%", JSON.stringify(bare) === JSON.stringify([3, 2, 50]), bare),
        check("7 days: 1 send, none in the 7 before (no change)", JSON.stringify(week) === JSON.stringify([1, 0, "absent"]), week),
        check("90 days: 7 sends, none in the 90 before", JSON.stringify(quarter) === JSON.stringify([7, 0, "absent"]), quarter),
      ]);
    },
  },
  {
    id: "previous-year-compares-the-same-dates-a-year-earlier",
    title: "vs previous year compares with the same dates a year earlier",
    entryPoint: "GET /api/mailing/metrics/kpi/sends?comparison=previous-year, /metrics/volume",
    async run(/** @type {Ctx} */ ctx) {
      await declareTemplates(ctx, [{ slug: "order", category: "orders" }]);
      const yearBack = (/** @type {number} */ days) => {
        const date = new Date(Date.now() - days * DAY_MS);
        date.setUTCFullYear(date.getUTCFullYear() - 1);
        return { $date: date.toISOString() };
      };
      await importSends(ctx, "this month and last year", [
        sendOf("n1", "order", "a@one.test", ago(3), [D]),
        sendOf("n2", "order", "b@one.test", ago(10), [D]),
        sendOf("y1", "order", "c@one.test", yearBack(3), [D]),
        sendOf("y2", "order", "d@one.test", yearBack(10), [D]),
        sendOf("y3", "order", "e@one.test", yearBack(20), [D]),
        sendOf("q1", "order", "f@one.test", ago(40), [D]),
      ]);
      const year = figure(await metric(ctx, `/kpi/sends${windowQuery(30, "previous-year")}`));
      const period = figure(await metric(ctx, `/kpi/sends${windowQuery(30)}`));
      const volume = await metric(ctx, `/volume${windowQuery(30, "previous-year")}`);
      const volumePeriod = await metric(ctx, `/volume${windowQuery(30)}`);
      const series = (/** @type {unknown} */ body) => (Array.isArray(pick(body, "comparisonSeries")) ? /** @type {Record<string, unknown>[]} */ (pick(body, "comparisonSeries")) : []);
      await ctx.verify("the comparison window follows the menu", [
        check("previous year: 3 sends a year earlier, 2 now, -33.3%", JSON.stringify(year) === JSON.stringify([2, 3, -33.3]), year),
        check("previous period: only the 40 days old send, so 2 against 1, +100%", JSON.stringify(period) === JSON.stringify([2, 1, 100]), period),
        check("the volume chart names the dashed series Previous year", series(volume)[0]?.name === "$dms_mailing.metrics.previous_year", series(volume)),
        check("the volume chart names the dashed series Previous period", series(volumePeriod)[0]?.name === "$dms_mailing.metrics.previous", series(volumePeriod)),
      ]);
    },
  },
  {
    id: "delivery-figures-show-no-value-when-nothing-reports-deliveries",
    title: "deliverability, open rate and click rate show no value until something reports deliveries back",
    entryPoint: "GET /api/mailing/metrics/kpi/*, /metrics/funnel, /metrics/attention",
    async run(/** @type {Ctx} */ ctx) {
      await declareTemplates(ctx, [{ slug: "order", category: "orders" }]);
      await importSends(ctx, "sends nothing reports on", [
        sendOf("u1", "order", "a@one.test", ago(2)),
        sendOf("u2", "order", "b@one.test", ago(3)),
        sendOf("u3", "order", "c@one.test", ago(4)),
      ]);
      const query = windowQuery(30);
      const read = async (/** @type {string} */ id) => await metric(ctx, `/kpi/${id}${query}`);
      const [sends, deliverability, openRate, clickRate, bounces] = await Promise.all(["sends", "deliverability", "open-rate", "click-rate", "bounces"].map(read));
      const funnel = await metric(ctx, `/funnel${query}`);
      const steps = Array.isArray(pick(funnel, "steps")) ? /** @type {Record<string, unknown>[]} */ (pick(funnel, "steps")) : [];
      const attention = await metric(ctx, `/attention${query}`);
      const ids = (Array.isArray(pick(attention, "items")) ? /** @type {Record<string, unknown>[]} */ (pick(attention, "items")) : []).map((item) => item.id);
      await ctx.verify("unmeasured figures state nothing", [
        check("Sends still counts 3", pick(sends, "value") === 3, sends),
        check("Deliverability has no value", pick(deliverability, "value") === undefined && Object.keys(/** @type {object} */ (deliverability)).length === 0, deliverability),
        check("Open rate has no value", Object.keys(/** @type {object} */ (openRate)).length === 0, openRate),
        check("Click rate has no value", Object.keys(/** @type {object} */ (clickRate)).length === 0, clickRate),
        check("Bounces still states 0", pick(bounces, "value") === 0, bounces),
        check("the funnel marks delivered, opened and clicked as not measured, sent and unsubscribed as measured", JSON.stringify(steps.map((step) => step.isMeasured)) === JSON.stringify([true, false, false, false, true]), steps.map((step) => [step.id, step.isMeasured])),
        check("Needs attention explains it: delivery is not measured", ids.includes("untracked-delivery") && !ids.includes("untracked-rates"), ids),
      ]);
      await importSends(ctx, "a webhook event comes back", [sendOf("u4", "order", "d@one.test", ago(1), [D])]);
      const after = await metric(ctx, `/kpi/deliverability${query}`);
      await ctx.verify("one reported delivery makes the figures measured", [
        check("Deliverability is 1 of 4 sends: 25", pick(after, "value") === 25, after),
      ]);
    },
  },
]);
