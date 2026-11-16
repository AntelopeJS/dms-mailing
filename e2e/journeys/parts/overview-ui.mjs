import { guarded } from "../../guard.mjs";
import { calling, check, TENANT } from "../../mailing.mjs";
import { attributeOf, isChecked, pageText, wait } from "./browser-kit.mjs";
import { window30 } from "./overview-kpis.mjs";
import { ago, declareCategories, declareTemplates, importSends, sendOf } from "./ui-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */
/** @typedef {import("../../mailing.mjs").Tab} Tab */

const D = { type: "delivered" };
const O = { type: "opened" };
const OVERVIEW = "/modules/mailing/overview";

/**
 * Waits until the page text matches, then returns it.
 *
 * @param {Tab} tab The tab
 * @param {RegExp} pattern What to wait for
 * @returns {Promise<string>} The text at the end
 */
async function settled(tab, pattern) {
  await tab.shows(pattern, { timeoutMs: 20_000 });
  return pageText(tab);
}

export const journeys = guarded([
  {
    id: "overview-page-shows-figures-and-follows-period-and-comparison",
    title: "the Overview shows the six KPIs in their groups, follows the 7D, 30D and 90D switch and the comparison menu",
    entryPoint: "/modules/mailing/overview",
    async run(/** @type {Ctx} */ ctx) {
      await declareTemplates(ctx, [{ slug: "order", category: "orders" }]);
      await importSends(ctx, "two windows", window30());
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto(OVERVIEW);
      const text = await settled(tab, /OPEN RATE 80%/i);
      await ctx.verify("the default period is 30 days, compared with the previous period, live", [
        check("the page is titled Overview with the described scope", /Overview Delivery and engagement for every e-mail your workspace sends\. Test sends are left out of these figures\./.test(text), text.slice(0, 400)),
        check("the header holds New template", (await tab.visible({ role: "button", name: "New template" })).pass, "New template"),
        check("Reach: Sends 8 (+100.0% vs 4), Deliverability 62.5% (+25.0% vs 50%)", /Reach Figures for the selected period SENDS 8 ▲ \+100\.0% vs 4 DELIVERABILITY 62\.5% ▲ \+25\.0% vs 50%/.test(text), text),
        check("Engagement: Open rate 80% (+60.0% vs 50%), Click rate 40% (vs 0%)", /Engagement Of delivered e-mails OPEN RATE 80% ▲ \+60\.0% vs 50% CLICK RATE 40% vs 0%/.test(text), text),
        check("List health: Bounces 1 (-50.0% vs 2), Unsubscribes 1 (vs 0)", /List health Lower is better BOUNCES 1 ▼ -50\.0% vs 2 UNSUBSCRIBES 1 vs 0/.test(text), text),
        check("the 30D preset is selected", await isChecked(tab, { role: "radio", name: "Last 30 days" }), "30D"),
        check("Live is pressed", (await attributeOf(tab, { role: "button", name: "Live" }, "aria-pressed")) === "true", "Live"),
        check("the comparison menu says vs previous period", /Comparison: vs previous period/.test(await attributeOf(tab, { role: "button", name: /^Comparison/ }, "aria-label")), "menu"),
        check("the volume chart states 8 sends against 4 and names the compared period", /SEND VOLUME 8 \+100\.0% vs 4 Sends Compared period/.test(text), text),
      ]);

      await tab.click({ role: "radio", name: "Last 7 days" });
      const week = await settled(tab, /SENDS 5 ▲ \+66\.7% vs 3/);
      await ctx.verify("7D reads the last 7 days against the 7 before", [
        check("Sends 5 vs 3, Deliverability 80% vs 33.3%", /SENDS 5 ▲ \+66\.7% vs 3 DELIVERABILITY 80% ▲ \+140\.0% vs 33\.3%/.test(week), week),
        check("Open rate 100% and Click rate 50%, each with nothing before", /OPEN RATE 100% vs 0% CLICK RATE 50% vs 0%/.test(week), week),
      ]);
      await tab.click({ role: "radio", name: "Last 90 days" });
      const quarter = await settled(tab, /SENDS 12 /);
      await ctx.verify("90D reads the last 90 days", [check("Sends 12 vs 0", /SENDS 12 vs 0/.test(quarter), quarter)]);

      await tab.click({ role: "radio", name: "Last 30 days" });
      await settled(tab, /SENDS 8 /);
      await tab.click({ role: "button", name: /^Comparison/ });
      await ctx.verify("the comparison menu offers three choices", [
        check("vs previous period", (await tab.visible({ role: "menuitem", name: "vs previous period" })).pass, "item"),
        check("vs previous year", (await tab.visible({ role: "menuitem", name: "vs previous year" })).pass, "item"),
        check("No comparison", (await tab.visible({ role: "menuitem", name: "No comparison" })).pass, "item"),
      ]);
      await tab.click({ role: "menuitem", name: "No comparison" });
      await wait(tab, 3000);
      const plain = await pageText(tab);
      await ctx.verify("No comparison removes every change, Needs attention stays", [
        check("no 'vs' figure remains on the cards", !/ vs \d/.test(plain.slice(plain.indexOf("Reach"), plain.indexOf("NEEDS ATTENTION"))), plain),
        check("the legend no longer names a compared period", !/Compared period/.test(plain), plain),
        check("the funnel drops its change column", !/▲ \d+%/.test(plain.slice(plain.indexOf("FUNNEL"), plain.indexOf("BEST OPENED"))), plain),
        check("Needs attention still lists the problems", /NEEDS ATTENTION 1 send has a problem|NEEDS ATTENTION 3 sends have a problem/.test(plain), plain),
      ]);
      await tab.click({ role: "button", name: /^Comparison/ });
      await tab.click({ role: "menuitem", name: "vs previous year" });
      await wait(tab, 3000);
      const year = await pageText(tab);
      await ctx.verify("vs previous year compares with a year earlier", [
        check("the menu names the year comparison", /Comparison: vs previous year/.test(await attributeOf(tab, { role: "button", name: /^Comparison/ }, "aria-label")), "menu"),
        check("nothing a year earlier: Sends 8 vs 0", /SENDS 8 vs 0/.test(year), year),
      ]);
    },
  },
  {
    id: "overview-funnel-rankings-and-attention-cards",
    title: "the lower cards: Needs attention with its verbs, the funnel switch and biggest drop, the two rankings with their empty state",
    entryPoint: "/modules/mailing/overview",
    async run(/** @type {Ctx} */ ctx) {
      await declareCategories(ctx, ["marketing"]);
      await declareTemplates(ctx, [{ slug: "order", category: "orders" }, { slug: "promo", name: "Promo", category: "marketing" }]);
      await importSends(ctx, "funnel", [
        sendOf("o1", "order", "a@one.test", ago(2), [D, O, { type: "clicked" }]),
        sendOf("o2", "order", "b@one.test", ago(3), [D]),
        sendOf("o3", "order", "c@one.test", ago(4), [{ type: "bounced" }]),
        sendOf("m1", "promo", "e@one.test", ago(2), [D, O]),
        sendOf("m2", "promo", "f@one.test", ago(3), [D]),
        ...Array.from({ length: 5 }, (_, i) => sendOf(`r${i}`, "promo", `u${i}@rank.test`, ago(3), i < 2 ? [D, O] : [D])),
        sendOf("q1", "order", "a@two.test", ago(40), [D]),
      ]);
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto(OVERVIEW);
      const text = await settled(tab, /BEST OPENED TEMPLATES.*Promo/);
      await ctx.verify("Needs attention names the problem with its verb and links to Problems", [
        check("1 send has a problem, 1 bounce, Review problems", /NEEDS ATTENTION 1 send has a problem 1 bounce Review problems/.test(text), text),
        check("the entry links to the Problems tab", (await attributeOf(tab, { role: "link", name: /Review problems/ }, "href")) === "/modules/mailing/sends?view=problems", "href"),
        check("the sender entry says Set the sender", /No sender address E-mails use the provider’s default address\. Set the sender/.test(text), text),
      ]);
      await ctx.verify("the funnel lists its five steps with counts and rates", [
        check("All: Sent 10 100%, Delivered 9 90%, Opened 4 44.4%, Clicked 1 11.1%, Unsubscribed 0 0%", /FUNNEL · SENT TO CLICKED All Transactional Marketing Sent 10 100% ▲ 900% Delivered 9 90% ▲ 800% Opened 4 44\.4% — Clicked 1 11\.1% — Unsubscribed 0 0% —/.test(text), text),
        check("it names the biggest drop between two steps", /Biggest drop: delivered → opened\./.test(text), text),
      ]);
      await tab.click({ role: "radio", name: "Marketing" });
      const marketing = await settled(tab, /Sent 7 100%/);
      await ctx.verify("the Marketing switch counts the marketing category only", [
        check("Sent 7, Delivered 7, Opened 3, Clicked 0", /Sent 7 100% .*Delivered 7 100% .*Opened 3 42\.9% .*Clicked 0 0%/.test(marketing), marketing),
      ]);
      await tab.click({ role: "radio", name: "Transactional" });
      const transactional = await settled(tab, /Sent 3 100%/);
      await ctx.verify("the Transactional switch counts the other templates", [
        check("Sent 3, Delivered 2, Opened 1, Clicked 1", /Sent 3 100% ▲ 200% Delivered 2 66\.7% .*Opened 1 50% .*Clicked 1 50%/.test(transactional), transactional),
      ]);
      await ctx.verify("the rankings state the template and the domain with 5 or more deliveries", [
        check("Best opened templates: Promo, slug and delivered count, open rate", /BEST OPENED TEMPLATES Last 30 days 1 Promo promo · 7 delivered 42\.9%/.test(transactional), transactional),
        check("Open rate by domain: Domains with 5 or more deliveries, rank.test 5 delivered 40%", /OPEN RATE BY DOMAIN Domains with 5 or more deliveries Last 30 days rank\.test 5 delivered 40%/.test(transactional), transactional),
      ]);
      await tab.click({ role: "radio", name: "Last 7 days" });
      await tab.click({ role: "button", name: /^Comparison/ });
      await tab.click({ role: "menuitem", name: "No comparison" });
      await wait(tab, 2000);
      await calling(ctx, "nothing", "category", [{ tenantId: TENANT, id: "noop", label: { en: "noop" }, icon: "i-ph-tag" }]);
    },
  },
  {
    id: "overview-empty-ranking-and-setup-checklist",
    title: "the rankings state when there are not enough deliveries; a workspace without a live template shows the setup checklist",
    entryPoint: "/modules/mailing/overview",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto(OVERVIEW);
      const setup = await settled(tab, /Send your first e-mail/);
      await ctx.verify("until a template is live the page shows the checklist instead of the figures", [
        check("the four steps are named", /Connect a provider.*Set the sender.*Publish a template.*Send yourself a test/.test(setup), setup),
        check("the first step is done: a provider is connected", /Done: a provider is connected, e-mails can leave\./.test(setup), setup),
        check("no KPI card is shown", !/DELIVERABILITY/.test(setup), setup),
      ]);
      await declareTemplates(ctx, [{ slug: "order", category: "orders" }]);
      await importSends(ctx, "a few sends", [sendOf("e1", "order", "a@one.test", ago(2), [D, O])]);
      await tab.goto(OVERVIEW);
      const figures = await settled(tab, /Not enough delivered e-mails to rank yet.*Not enough delivered e-mails to rank yet/);
      await ctx.verify("once a template is live the figures show, with Resume the setup while a step is open", [
        check("the KPI cards show", /DELIVERABILITY 100%/.test(figures), figures),
        check("both rankings say there are not enough delivered e-mails", (figures.match(/Not enough delivered e-mails to rank yet/g) ?? []).length === 2, figures),
        check("Resume the setup is offered", (await tab.visible({ role: "button", name: "Resume the setup" })).pass, "resume"),
      ]);
      await tab.click({ role: "button", name: "Resume the setup" });
      const resumed = await settled(tab, /Send your first e-mail/);
      await ctx.verify("Resume the setup reopens the checklist", [
        check("the checklist shows the publish step done", /Done: a template is live\./.test(resumed), resumed),
        check("the sender step is still open", /Set the sender Name and address customers see\./.test(resumed), resumed),
      ]);
    },
  },
]);
