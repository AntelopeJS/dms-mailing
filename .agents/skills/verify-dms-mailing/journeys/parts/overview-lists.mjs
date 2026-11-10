import { guarded } from "../../guard.mjs";
import { calling, check, list, mailing, pick, TENANT } from "../../mailing.mjs";
import { DAY_MS, HOUR_MS, ago, declareCategories, declareTemplates, importSends, metric, sendOf, testOf, windowQuery } from "./ui-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */
/** @typedef {import("../../mailing.mjs").Row} Row */

const D = { type: "delivered" };
const O = { type: "opened" };
const C = { type: "clicked" };

/**
 * @param {number} actual A figure
 * @param {number} expected The figure wanted
 * @returns {boolean} Whether they agree to 1e-6
 */
const near = (actual, expected) => Math.abs(actual - expected) < 1e-6;

/**
 * Sends of one template delivered to `delivered` recipients, `opened` of them opening.
 *
 * @param {{ prefix: string, slug: string, delivered: number, opened: number, when: { $date: string }, to: (index: number) => string, isTest?: boolean }} order What to build
 * @returns {Row[]} The imports
 */
function batch(order) {
  const make = order.isTest ? testOf : sendOf;
  return Array.from({ length: order.delivered }, (_, index) => make(`${order.prefix}-${index}`, order.slug, order.to(index), order.when, index < order.opened ? [D, O] : [D]));
}

export const journeys = guarded([
  {
    id: "volume-chart-plots-sends-per-day-with-an-aligned-comparison",
    title: "the send volume chart plots sends per day, leaves out test and suppressed sends, and draws the compared period aligned day by day",
    entryPoint: "GET /api/mailing/metrics/volume",
    async run(/** @type {Ctx} */ ctx) {
      await declareTemplates(ctx, [{ slug: "order", category: "orders" }]);
      const end = new Date();
      const at = (/** @type {number} */ days) => ({ $date: new Date(end.getTime() - 6 * HOUR_MS - days * DAY_MS).toISOString() });
      await importSends(ctx, "seven days and the seven before", [
        sendOf("v1", "order", "a@one.test", at(0), [D]),
        sendOf("v2", "order", "b@one.test", at(0), [D]),
        sendOf("v3", "order", "c@one.test", at(2), [D]),
        sendOf("v4", "order", "d@one.test", at(5), [D]),
        sendOf("v5", "order", "e@one.test", at(5), [D]),
        sendOf("v6", "order", "f@one.test", at(5), [D]),
        testOf("vt", "order", "t@one.test", at(0), [D]),
        sendOf("w1", "order", "a@two.test", at(7), [D]),
        sendOf("w2", "order", "b@two.test", at(13), [D]),
        sendOf("w3", "order", "c@two.test", at(13), [D]),
        sendOf("w4", "order", "d@two.test", at(13), [D]),
        sendOf("w5", "order", "e@two.test", at(13), [D]),
      ]);
      await mailing(ctx, "suppress an address", "POST", "/suppressions", { body: { email: "blocked@one.test" } });
      const blocked = await calling(ctx, "send to the suppressed address", "send", ["order", { tenantId: TENANT, to: "blocked@one.test" }]);
      const query = `?from=${encodeURIComponent(new Date(end.getTime() - 7 * DAY_MS).toISOString())}&to=${encodeURIComponent(new Date(end.getTime() + HOUR_MS).toISOString())}&comparison=previous-period`;
      const shifted = await metric(ctx, `/volume${query}`);
      const body = await metric(ctx, `/volume${windowQuery(7)}`);
      const points = list(pick(body, "series", "0") ? { series: pick(body, "series") } : body, "series");
      const data = list(points.at(0)?.data);
      const compared = list(body, "comparisonSeries");
      const comparedData = list(compared.at(0)?.data);
      const labels = data.map((point) => point.x);
      const expectedDays = Array.from({ length: 7 }, (_, index) => new Date(end.getTime() - 7 * DAY_MS + index * DAY_MS + DAY_MS / 2).toISOString().slice(0, 10));
      await ctx.verify("the chart counts the real sends of each day", [
        check("the suppressed send was suppressed", pick(blocked.result, "status") === "suppressed", blocked.result),
        check("the series is named Sends", first?.name === "$dms_mailing.metrics.sends", first?.name),
        check("one point per day of the 7 days, each labelled with its day", JSON.stringify(labels) === JSON.stringify(expectedDays), labels),
        check("sends per day: 0,3,0,0,1,0,2 (the test send and the suppressed send are not counted)", JSON.stringify(data.map((point) => point.y)) === JSON.stringify([0, 3, 0, 0, 1, 0, 2]), data.map((point) => point.y)),
        check("the figure is the sum, 6, against 5 in the previous 7 days", pick(body, "value") === 6 && pick(body, "previousValue") === 5 && pick(body, "delta") === 20, [pick(body, "value"), pick(body, "previousValue"), pick(body, "delta")]),
        check("the compared period is one dashed series named Previous period", compared.length === 1 && compared[0]?.name === "$dms_mailing.metrics.previous", compared),
        check("the compared series is aligned day by day on the axis of the selected period", JSON.stringify(comparedData.map((point) => point.x)) === JSON.stringify(expectedDays), comparedData.map((point) => point.x)),
        check("compared sends per day: 4,0,0,0,0,0,1 (day 1 on day 1)", JSON.stringify(comparedData.map((point) => point.y)) === JSON.stringify([4, 0, 0, 0, 0, 0, 1]), comparedData.map((point) => point.y)),
        check("a window that ends an hour later still counts the last day (no day is dropped)", list(shifted, "series").length === 1 && pick(shifted, "value") === 6, pick(shifted, "value")),
      ]);
      const none = await metric(ctx, `/volume${windowQuery(7, "none")}`);
      await ctx.verify("No comparison draws no dashed series", [
        check("no compared series and no previous figure", list(none, "comparisonSeries").length === 0 && pick(none, "previousValue") === undefined && pick(none, "delta") === undefined, none),
      ]);
    },
  },
  {
    id: "best-opened-templates-rank-up-to-10-with-5-deliveries-or-more",
    title: "Best opened templates ranks up to 10 templates by open rate, only rows with 5 or more deliveries, and each row changes against the compared period",
    entryPoint: "GET /api/mailing/metrics/top-templates",
    async run(/** @type {Ctx} */ ctx) {
      const slugs = Array.from({ length: 12 }, (_, index) => `t${String(index).padStart(2, "0")}`);
      await declareTemplates(ctx, [...slugs.map((slug) => ({ slug, name: `Template ${slug}`, category: "orders" })), { slug: "few", name: "Template few" }, { slug: "five", name: "Template five" }]);
      const to = (/** @type {string} */ domain) => (/** @type {number} */ index) => `u${index}@${domain}`;
      /** @type {Row[]} */
      const sends = [];
      slugs.forEach((slug, index) => sends.push(...batch({ prefix: `cur-${slug}`, slug, delivered: 12, opened: index, when: ago(10), to: to("rank.test") })));
      sends.push(...batch({ prefix: "cur-few", slug: "few", delivered: 4, opened: 4, when: ago(10), to: to("rank.test") }));
      sends.push(...batch({ prefix: "cur-five", slug: "five", delivered: 5, opened: 5, when: ago(10), to: to("rank.test") }));
      sends.push(...batch({ prefix: "cur-test", slug: "t00", delivered: 10, opened: 10, when: ago(10), to: to("tests.test"), isTest: true }));
      sends.push(...batch({ prefix: "prev-t11", slug: "t11", delivered: 12, opened: 6, when: ago(40), to: to("old.test") }));
      sends.push(...batch({ prefix: "prev-t10", slug: "t10", delivered: 4, opened: 4, when: ago(40), to: to("old.test") }));
      sends.push(...batch({ prefix: "prev-t09", slug: "t09", delivered: 5, opened: 5, when: ago(40), to: to("old.test") }));
      await importSends(ctx, "templates", sends);
      const body = await metric(ctx, `/top-templates${windowQuery(30)}`);
      const items = list(body, "items");
      const byId = new Map(items.map((item) => [item.id, item]));
      const expectedOrder = ["five", "t11", "t10", "t09", "t08", "t07", "t06", "t05", "t04", "t03"];
      await ctx.verify("the ranking lists the 10 best opened, best first", [
        check("10 rows, best first: five (100%) then t11 down to t03", JSON.stringify(items.map((item) => item.id)) === JSON.stringify(expectedOrder), items.map((item) => item.id)),
        check("a template with 4 deliveries is not ranked, one with exactly 5 is", !byId.has("few") && byId.has("five"), [...byId.keys()]),
        check("test sends do not lift a template (t00 stays out)", !byId.has("t00"), [...byId.keys()]),
        check("the values are the open rates in percent", near(Number(byId.get("five")?.value), 100) && near(Number(byId.get("t11")?.value), (11 / 12) * 100) && near(Number(byId.get("t03")?.value), 25), items.map((item) => item.value)),
        check("a row carries the template's name and its delivered count", byId.get("t11")?.title === "Template t11" && pick(byId.get("t11"), "description", "params", "count", "value") === 12, byId.get("t11")),
        check("a row links to the template", String(byId.get("t11")?.to).startsWith("/modules/mailing/templates/"), byId.get("t11")?.to),
      ]);
      await ctx.verify("each row changes against the compared period", [
        check("t11: 91.7% against 50%, +83.3", near(Number(byId.get("t11")?.delta), 83.3), byId.get("t11")),
        check("t10: the compared period had 4 deliveries, so no change is stated", byId.has("t10") && !Object.hasOwn(byId.get("t10") ?? {}, "delta"), byId.get("t10")),
        check("t09: exactly 5 deliveries in the compared period, 75% against 100%, -25", near(Number(byId.get("t09")?.delta), -25), byId.get("t09")),
        check("t08: nothing in the compared period, no change", byId.has("t08") && !Object.hasOwn(byId.get("t08") ?? {}, "delta"), byId.get("t08")),
      ]);
      const plain = list(await metric(ctx, `/top-templates${windowQuery(30, "none")}`), "items");
      await ctx.verify("No comparison removes every change", [check("no row has a delta", plain.length === 10 && plain.every((item) => !("delta" in item)), plain.map((item) => item.delta))]);
    },
  },
  {
    id: "open-rate-by-domain-ranks-up-to-6-domains-with-5-deliveries-or-more",
    title: "Open rate by domain ranks up to 6 recipient domains with 5 or more deliveries, with a change per row",
    entryPoint: "GET /api/mailing/metrics/domains",
    async run(/** @type {Ctx} */ ctx) {
      await declareTemplates(ctx, [{ slug: "order", category: "orders" }]);
      /** @type {Row[]} */
      const sends = [];
      for (let level = 0; level <= 6; level += 1) sends.push(...batch({ prefix: `dom-${level}`, slug: "order", delivered: 10, opened: level, when: ago(10), to: (index) => `u${index}@D${level}.test` }));
      sends.push(...batch({ prefix: "dom-few", slug: "order", delivered: 4, opened: 4, when: ago(10), to: (index) => `u${index}@few.test` }));
      sends.push(...batch({ prefix: "dom-five", slug: "order", delivered: 5, opened: 5, when: ago(10), to: (index) => `u${index}@five.test` }));
      sends.push(...batch({ prefix: "dom-test", slug: "order", delivered: 10, opened: 10, when: ago(10), to: (index) => `u${index}@d0.test`, isTest: true }));
      sends.push(...batch({ prefix: "prev-d6", slug: "order", delivered: 10, opened: 3, when: ago(40), to: (index) => `u${index}@d6.test` }));
      sends.push(...batch({ prefix: "prev-d5", slug: "order", delivered: 4, opened: 4, when: ago(40), to: (index) => `u${index}@d5.test` }));
      await importSends(ctx, "domains", sends);
      const items = list(await metric(ctx, `/domains${windowQuery(30)}`), "items");
      const byId = new Map(items.map((item) => [item.id, item]));
      await ctx.verify("the domains are ranked on open rate", [
        check("6 rows: five.test (100%), then d6 down to d2; the 7th, d1, d0 and few.test are out", JSON.stringify(items.map((item) => item.id)) === JSON.stringify(["five.test", "d6.test", "d5.test", "d4.test", "d3.test", "d2.test"]), items.map((item) => item.id)),
        check("a domain with 4 deliveries is not ranked, one with 5 is", !byId.has("few.test") && byId.has("five.test"), [...byId.keys()]),
        check("domains are lower-cased and test sends do not count", !byId.has("d0.test") && byId.has("d6.test"), [...byId.keys()]),
        check("values are the open rates, descriptions the delivered counts", near(Number(byId.get("d6.test")?.value), 60) && near(Number(byId.get("d2.test")?.value), 20) && pick(byId.get("d6.test"), "description", "params", "count", "value") === 10, items.map((item) => item.value)),
        check("d6: 60% against 30%, +100", near(Number(byId.get("d6.test")?.delta), 100), byId.get("d6.test")),
        check("d5: the compared period had 4 deliveries, no change stated", byId.has("d5.test") && !Object.hasOwn(byId.get("d5.test") ?? {}, "delta"), byId.get("d5.test")),
        check("d4: nothing in the compared period, no change", byId.has("d4.test") && !Object.hasOwn(byId.get("d4.test") ?? {}, "delta"), byId.get("d4.test")),
      ]);
      const plain = list(await metric(ctx, `/domains${windowQuery(30, "none")}`), "items");
      await ctx.verify("No comparison removes every change", [check("no row has a delta", plain.length === 6 && plain.every((item) => !("delta" in item)), plain.map((item) => item.delta))]);
    },
  },
  {
    id: "funnel-counts-sent-to-unsubscribed-by-template-kind",
    title: "the funnel counts sent, delivered, opened, clicked and unsubscribed for All, Transactional and Marketing templates, with the change per step",
    entryPoint: "GET /api/mailing/metrics/funnel",
    async run(/** @type {Ctx} */ ctx) {
      await declareCategories(ctx, ["marketing"]);
      await declareTemplates(ctx, [
        { slug: "order", category: "orders" },
        { slug: "promo", category: "marketing" },
        { slug: "plain" },
      ]);
      await importSends(ctx, "two windows", [
        sendOf("o1", "order", "a@one.test", ago(2), [D, O, C]),
        sendOf("o2", "order", "b@one.test", ago(3), [D]),
        sendOf("o3", "order", "c@one.test", ago(4), [{ type: "bounced" }]),
        sendOf("o4", "order", "d@one.test", ago(5), [D, O, { type: "unsubscribed" }]),
        sendOf("m1", "promo", "e@one.test", ago(2), [D, O, C]),
        sendOf("m2", "promo", "f@one.test", ago(3), [D, O]),
        sendOf("m3", "promo", "g@one.test", ago(4), [D]),
        sendOf("m4", "promo", "h@one.test", ago(5), [D]),
        sendOf("m5", "promo", "i@one.test", ago(6), [{ type: "sent" }]),
        sendOf("m6", "promo", "j@one.test", ago(7), [{ type: "bounced" }]),
        testOf("x1", "promo", "t@one.test", ago(2), [D, O, C]),
        sendOf("pl", "plain", "k@one.test", ago(2), [D]),
        sendOf("q1", "order", "a@two.test", ago(35), [D, O]),
        sendOf("q2", "order", "b@two.test", ago(36), [{ type: "bounced" }]),
        sendOf("q3", "promo", "c@two.test", ago(37), [D]),
        sendOf("q4", "promo", "d@two.test", ago(38), [D, O, C]),
      ]);
      const stepsOf = async (/** @type {string} */ query) => list(await metric(ctx, `/funnel${query}`), "steps");
      const summary = (/** @type {Row[]} */ steps) => steps.map((step) => [step.id, step.count, step.rate === null ? null : Math.round(Number(step.rate) * 10) / 10]);
      const all = await stepsOf(`${windowQuery(30)}&kind=all`);
      const transactional = await stepsOf(`${windowQuery(30)}&kind=transactional`);
      const marketing = await stepsOf(`${windowQuery(30)}&kind=marketing`);
      const unknown = await stepsOf(`${windowQuery(30)}&kind=nonsense`);
      const plainSteps = await stepsOf(`${windowQuery(30, "none")}&kind=marketing`);
      await ctx.verify("the funnel counts each step, as its KPI does", [
        check("All: sent 11, delivered 8 (72.7), opened 4 of 8 delivered (50), clicked 2 (25), unsubscribed 1 (12.5)", JSON.stringify(summary(all)) === JSON.stringify([["sent", 11, 100], ["delivered", 8, 72.7], ["opened", 4, 50], ["clicked", 2, 25], ["unsubscribed", 1, 12.5]]), summary(all)),
        check("Transactional (the orders category and a template with none): sent 5, delivered 4 (80), opened 2 (50), clicked 1 (25), unsubscribed 1 (25)", JSON.stringify(summary(transactional)) === JSON.stringify([["sent", 5, 100], ["delivered", 4, 80], ["opened", 2, 50], ["clicked", 1, 25], ["unsubscribed", 1, 25]]), summary(transactional)),
        check("Marketing (the marketing category): sent 6, delivered 4 (66.7), opened 2 (50), clicked 1 (25), unsubscribed 0", JSON.stringify(summary(marketing)) === JSON.stringify([["sent", 6, 100], ["delivered", 4, 66.7], ["opened", 2, 50], ["clicked", 1, 25], ["unsubscribed", 0, 0]]), summary(marketing)),
        check("an unknown kind reads as All", JSON.stringify(summary(unknown)) === JSON.stringify(summary(all)), summary(unknown)),
        check("the five steps come in order with their labels", JSON.stringify(all.map((step) => step.label)) === JSON.stringify(["sent", "delivered", "opened", "clicked", "unsubscribed"].map((id) => `$dms_mailing.funnel.${id}`)), all.map((step) => step.label)),
      ]);
      const deltaOf = (/** @type {Row} */ step) => ("delta" in step ? step.delta : "absent");
      await ctx.verify("each step changes against the compared period", [
        check("All: previous counts 4,3,2,1,0", JSON.stringify(all.map((step) => step.previousCount)) === JSON.stringify([4, 3, 2, 1, 0]), all.map((step) => step.previousCount)),
        check("All: changes +175, +166.7, +100, +100 and none for the step that was 0", JSON.stringify(all.map(deltaOf)) === JSON.stringify([175, 166.7, 100, 100, "absent"]), all.map(deltaOf)),
        check("Marketing: previous counts 2,2,1,1,0", JSON.stringify(marketing.map((step) => step.previousCount)) === JSON.stringify([2, 2, 1, 1, 0]), marketing.map((step) => step.previousCount)),
        check("No comparison leaves no previous count and no change", plainSteps.length === 5 && plainSteps.every((step) => step.previousCount === undefined && step.delta === undefined), plainSteps),
      ]);
    },
  },
]);
