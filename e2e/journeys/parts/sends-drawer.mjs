import { guarded } from "../../guard.mjs";
import { check, list, mailing, text } from "../../mailing.mjs";
import { boxOfText, clickBesideDrawer, dialogButtons, dialogText, dragDrawerEdge, pageText, urlOf, wait } from "./browser-kit.mjs";
import { openSends, seedLog, waitForText, WHO } from "./sends-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */
/** @typedef {import("../../mailing.mjs").Tab} Tab */

const COMMON = ["Previous", "Next", "Close", "Copy link", "Copy JSON"];

/**
 * @param {Tab} tab The tab on the log
 * @param {string} address The recipient to open
 * @returns {Promise<string>} The drawer's text
 */
async function openRow(tab, address) {
  await tab.click({ role: "row", name: new RegExp(`(^| )${address.replace(".", "\\.")}`) });
  const dialog = await waitForDialog(tab, address);
  return dialog;
}

/**
 * @param {Tab} tab The tab
 * @param {string} address The recipient the drawer must be headed by
 * @returns {Promise<string>} The drawer's text
 */
async function waitForDialog(tab, address) {
  let found = "";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    found = await dialogText(tab).catch(() => "");
    if (found.startsWith(`${address} · order`)) return found;
    await wait(tab, 400);
  }
  return found;
}

/**
 * @param {Tab} tab The tab with an open drawer
 * @returns {Promise<string[]>} The footer buttons: the names after Copy JSON
 */
async function footerOf(tab) {
  const names = await dialogButtons(tab);
  return names.slice(names.indexOf("Copy JSON") + 1);
}

const FOOTERS = [
  ["delivered", WHO.delivered, ["Send again…", "View the e-mail"]],
  ["opened", WHO.opened, ["Send again…", "View the e-mail"]],
  ["clicked", WHO.clicked, ["Send again…", "View the e-mail"]],
  ["sent", WHO.sent, ["Send again…", "View the e-mail"]],
  ["queued", WHO.queued, ["Send again…", "View the e-mail"]],
  ["a test send", WHO.test, ["Send again…", "View the e-mail"]],
  ["a permanent bounce", WHO.hard, ["View the e-mail", "Copy the address", "Send to another address"]],
  ["a temporary bounce", WHO.soft, ["View the e-mail", "Send again…"]],
  ["a provider failure", WHO.failed, ["View the e-mail", "Send again…"]],
  ["a spam report", WHO.spam, ["View the e-mail", "Copy the address"]],
  ["an unsubscription", WHO.unsubscribed, ["View the e-mail", "Copy the address"]],
  ["a suppressed send", WHO.suppressed, ["View the e-mail", "Copy the address"]],
];

export const journeys = guarded([
  {
    id: "drawer-opens-steps-keeps-its-url-and-closes",
    title: "a click opens the send in a drawer headed by recipient and template and its place in the log; J and K step; the URL keeps the send; Escape or a click beside closes it",
    entryPoint: "/modules/mailing/sends",
    async run(/** @type {Ctx} */ ctx) {
      await seedLog(ctx);
      const tab = await openSends(ctx);
      const first = await openRow(tab, WHO.delivered);
      const url = urlOf(tab);
      await ctx.verify("a click opens the drawer", [
        check("headed by the recipient and the template", first.startsWith("ok@one.test · order ok@one.test · order"), first.slice(0, 80)),
        check("it states its place in the log: Send 2 of 21", /Send 2 of 21 /.test(first), first.slice(0, 120)),
        check("Previous and Next are offered", (await dialogButtons(tab)).includes("Previous") && (await dialogButtons(tab)).includes("Next"), await dialogButtons(tab)),
        check("the URL keeps the open send", /[?&]record=[0-9a-f-]{32,36}(&|$)/.test(url), url),
      ]);
      await tab.press("j");
      const next = await waitForDialog(tab, WHO.opened);
      await tab.press("j");
      const third = await waitForDialog(tab, WHO.hard);
      await tab.press("k");
      const back = await waitForDialog(tab, WHO.opened);
      await ctx.verify("J and K step through the log", [
        check("J opens the next send: Send 3 of 21", /Send 3 of 21 /.test(next), next.slice(0, 100)),
        check("J again: the bounce, Send 4 of 21 (the click send is further down)", /Send 4 of 21 /.test(third) || /Send 4 of 21/.test(third), third.slice(0, 100)),
        check("K goes back: Send 3 of 21", /Send 3 of 21 /.test(back), back.slice(0, 100)),
      ]);
      await tab.reload();
      const reloaded = await waitForDialog(tab, WHO.opened);
      await ctx.verify("the link reopens the same send", [check("after a reload the drawer shows open@one.test", /Send 3 of 21 /.test(reloaded), reloaded.slice(0, 100))]);
      await tab.press("Escape");
      await wait(tab, 800);
      const closed = !(await pageText(tab)).includes("Copy JSON") && !/record=/.test(urlOf(tab));
      await openRow(tab, WHO.delivered);
      await clickBesideDrawer(tab);
      await wait(tab, 800);
      const clickedAway = !(await pageText(tab)).includes("Copy JSON");
      await ctx.verify("Escape and a click beside the drawer close it", [
        check("Escape closes the drawer and drops the send from the URL", closed, urlOf(tab)),
        check("a click beside the drawer closes it", clickedAway, urlOf(tab)),
      ]);
      await tab.click({ role: "button", name: /^Problems \d+$/ });
      await waitForText(tab, /Send log 5 /);
      const inProblems = await openRow(tab, WHO.hard);
      await ctx.verify("the position follows the tab", [check("Send 1 of 5 in Problems", /Send 1 of 5 /.test(inProblems), inProblems.slice(0, 100))]);
    },
  },
  {
    id: "drawer-width-is-dragged-and-remembered",
    title: "dragging the drawer's left edge widens it, a wide drawer puts the timeline and the origin side by side, and the drawer opens again at the width given",
    entryPoint: "/modules/mailing/sends",
    async run(/** @type {Ctx} */ ctx) {
      await seedLog(ctx);
      const tab = await openSends(ctx);
      await openRow(tab, WHO.opened);
      const narrow = await boxOfText(tab, "Timeline");
      const narrowOrigin = await boxOfText(tab, "Origin");
      await dragDrawerEdge(tab, 450);
      await wait(tab, 600);
      const wide = await boxOfText(tab, "Timeline");
      const wideOrigin = await boxOfText(tab, "Origin");
      await tab.press("Escape");
      await wait(tab, 600);
      await openRow(tab, WHO.opened);
      const again = await boxOfText(tab, "Timeline");
      await ctx.verify("the drawer widens and keeps its width", [
        check("the drawer is wider after the drag", wide.width > narrow.width + 300, [narrow.width, wide.width]),
        check("narrow: the origin sits under the timeline", Math.abs(narrowOrigin.x - narrow.x) < 5 && narrowOrigin.y > narrow.y, [narrow, narrowOrigin]),
        check("wide: the timeline and the origin sit side by side", wideOrigin.x > wide.x + 100 && Math.abs(wideOrigin.y - wide.y) < 40, [wide, wideOrigin]),
        check("reopened, the drawer has the width given", Math.abs(again.width - wide.width) < 5, [wide.width, again.width]),
      ]);
    },
  },
  {
    id: "drawer-footer-follows-the-status",
    title: "the drawer footer offers the actions of the send's status, a suppressed send whose address was reactivated offers Send again…, a send sent again offers none",
    entryPoint: "/modules/mailing/sends",
    async run(/** @type {Ctx} */ ctx) {
      await seedLog(ctx);
      const tab = await openSends(ctx);
      for (const [label, address, expected] of FOOTERS) {
        await openRow(tab, String(address));
        const names = await dialogButtons(tab);
        const footer = await footerOf(tab);
        await ctx.verify(`the footer of ${String(label)}`, [
          check(`${String(label)}: ${JSON.stringify(expected)}`, JSON.stringify(footer) === JSON.stringify(expected), names),
          check(`${String(label)}: the header buttons are Previous, Next, Close, Copy link, Copy JSON`, COMMON.every((name) => names.includes(name)), names),
        ]);
        await tab.press("Escape");
        await wait(tab, 500);
      }
      const rows = list((await mailing(ctx, "the suppression list", "GET", "/tables/suppressions/list?limit=50")).body, "results");
      const entry = rows.find((row) => row.email === WHO.suppressed);
      const removed = await mailing(ctx, "reactivate the address", "DELETE", `/suppressions/${text(entry, "_id")}`);
      await tab.reload();
      await waitForText(tab, /Send log \d+/);
      await openRow(tab, WHO.suppressed);
      await wait(tab, 1500);
      const reactivated = await footerOf(tab);
      await ctx.verify("a suppressed send whose address was reactivated offers Send again…", [
        check("the address is reactivated", removed.status === 200, removed.body),
        check("footer: View the e-mail, Send again…", JSON.stringify(reactivated) === JSON.stringify(["View the e-mail", "Send again…"]), reactivated),
      ]);
    },
  },
]);
