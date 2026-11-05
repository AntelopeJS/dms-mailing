import { guarded } from "../../guard.mjs";
import { calling, check, TENANT } from "../../mailing.mjs";
import { dialogButtons, dialogText, pageText, rowCount, wait } from "./browser-kit.mjs";
import { openSends, seedLog, waitForText, WHO } from "./sends-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */
/** @typedef {import("../../mailing.mjs").Tab} Tab */

/**
 * @param {Tab} tab The tab on the log
 * @param {string} address The recipient to open
 * @returns {Promise<string>} The drawer's text once it is headed by the recipient
 */
async function openRow(tab, address) {
  await tab.click({ role: "row", name: new RegExp(`(^| )${address.replace(".", "\\.")}`) });
  let found = "";
  for (let attempt = 0; attempt < 40 && !found.startsWith(`${address} · order`); attempt += 1) {
    found = await dialogText(tab).catch(() => "");
    await wait(tab, 400);
  }
  return found;
}

const CONTENT = [
  ["a permanent bounce", WHO.hard, /Bounced .*This address doesn’t exist The server of one\.test refused it\. Future sends to it will bounce too\. TIMELINE Queued [\d:]+ Permanent bounce 550 5\.1\.1 Mailbox does not exist [\d:]+ ORIGIN order · v1 import source DATA SENT Copy JSON \{\}/],
  ["a temporary bounce", WHO.soft, /Bounced .*The mailbox is full one\.test knows the address but has no room left for it\. A later send may get through\. TIMELINE Queued [\d:]+ Temporary bounce 452 4\.2\.2 mailbox full/],
  ["a provider failure", WHO.failed, /Failed .*The provider couldn’t be reached The connection was refused or the server wasn’t found: nothing was delivered\. Sending again is safe once the provider’s address is fixed\. TIMELINE Queued [\d:]+ Send failed connect ECONNREFUSED/],
  ["a spam report", WHO.spam, /Spam .*Marked as spam The recipient flagged this e-mail\. Their address is on the suppression list: nothing more is sent to it\. TIMELINE Queued [\d:]+ Delivered [\d:]+ Marked as spam/],
  ["an unsubscription", WHO.unsubscribed, /Unsubscribed .*The recipient unsubscribed Their address is on the suppression list: nothing more is sent to it\. TIMELINE Queued [\d:]+ Delivered [\d:]+ Unsubscribed/],
  ["a queued send", WHO.queued, /Queued .*TIMELINE Queued [\d:]+ Handed to the provider Waiting for the provider/],
  ["a suppressed send", WHO.suppressed, /Suppressed .*API LATENCY — Not handed to the provider Not sent: this address is on the suppression list blocked@one\.test Added by hand, since .* Reactivate the address to send to it again\. Suppression list TIMELINE Not sent: the address is suppressed/],
  ["a delivered send", WHO.delivered, /Delivered .*TEMPLATE order v1 LOCALE EN As requested API LATENCY — API call to the provider TIMELINE Queued [\d:]+ Delivered [\d:]+ ORIGIN order · v1 import source/],
  ["a test send", WHO.test, /Delivered TEST /],
];

export const journeys = guarded([
  {
    id: "drawer-explains-the-problem-timeline-origin-and-data",
    title: "the drawer says in plain words what went wrong, lists the timeline with the provider's answer, the origin, and the data sent",
    entryPoint: "/modules/mailing/sends",
    async run(/** @type {Ctx} */ ctx) {
      await seedLog(ctx);
      const tab = await openSends(ctx);
      for (const [label, address, pattern] of CONTENT) {
        const text = await openRow(tab, String(address));
        await ctx.verify(`the drawer of ${String(label)}`, [check(`${String(label)}: ${String(pattern).slice(0, 90)}…`, /** @type {RegExp} */ (pattern).test(text), text)]);
        await tab.press("Escape");
        await wait(tab, 500);
      }
      const sent = await calling(ctx, "send with data", "send", ["order", { tenantId: TENANT, to: "data@one.test", variables: { customer: { name: "Sofie" }, total: 42 } }]);
      await tab.reload();
      await waitForText(tab, /data@one\.test/);
      const withData = await openRow(tab, "data@one.test");
      await tab.click({ role: "button", name: "Copy JSON" });
      const toasted = await tab.shows(/Data copied/, { timeoutMs: 8000 });
      await ctx.verify("the data sent is shown as JSON and can be copied", [
        check("the send is made", sent.ok, sent.error),
        check("Data sent holds the variables, pretty printed", /DATA SENT Copy JSON \{ "customer": \{ "name": "Sofie" \}, "total": 42 \}/.test(withData), withData),
        check("Copy JSON confirms with Data copied", toasted.pass, toasted.detail),
      ]);
      await tab.click({ role: "button", name: "View the e-mail" });
      await wait(tab, 3000);
      const rendered = await pageText(tab);
      await ctx.verify("View the e-mail renders the e-mail again", [check("the rendering shows the subject of the stored version", /Subject order en/.test(rendered), rendered.slice(-400))]);
    },
  },
  {
    id: "send-again-from-the-drawer-is-confirmed-and-resolves-the-problem",
    title: "Send again… asks for confirmation with the recipient, the version and the last error, sends, and the original is marked Resolved with no second send again",
    entryPoint: "/modules/mailing/sends",
    async run(/** @type {Ctx} */ ctx) {
      await seedLog(ctx);
      const tab = await openSends(ctx);
      await openRow(tab, WHO.failed);
      await tab.click({ role: "button", name: "Send again…" });
      await wait(tab, 1000);
      const asked = await pageText(tab);
      await ctx.verify("the confirmation names what goes", [
        check("title Send this e-mail again?", /Send this e-mail again\?/.test(asked), asked.slice(-600)),
        check("The same version and data go to the recipient; it is a real send", /The same version and data go to fail@one\.test\. It is a real send\./.test(asked), asked.slice(-600)),
        check("it lists To, Template and the last try", /To fail@one\.test Template order .*Last try .*connect ECONNREFUSED/.test(asked), asked.slice(-600)),
      ]);
      await tab.click({ role: "button", name: "Send again", exact: true });
      const mailed = await ctx.mail((message) => message.to.some((address) => address.includes("fail@one.test")));
      await wait(tab, 2000);
      await ctx.verify("the e-mail goes", [check("the sink received it", mailed.match !== undefined, mailed.messages.map((message) => message.to))]);
      await tab.press("Escape");
      await tab.click({ role: "button", name: /^Problems \d+$/ });
      const text = await waitForText(tab, /Send log 4 /);
      const rowOfFailure = await rowCount(tab, /(^| )fail@one\.test/);
      await ctx.verify("the original leaves Problems", [
        check("Problems now lists 4 sends", /Send log 4 /.test(text), text.slice(text.indexOf("Send log"), text.indexOf("Send log") + 40)),
        check("fail@one.test is no longer among them", Number(rowOfFailure) === 0, rowOfFailure),
      ]);
      await tab.click({ role: "button", name: /^All \d+$/ });
      await waitForText(tab, /Send log 22 /);
      const resolved = await pageText(tab);
      await tab.click({ role: "row", name: /(^| )fail@one\.test/, nth: 1 });
      await wait(tab, 1500);
      const drawer = await dialogText(tab);
      const footer = (await dialogButtons(tab)).slice(-2);
      await ctx.verify("the original is marked Resolved and offers no second send again", [
        check("the row carries a Resolved badge", /fail@one\.test Resolved/.test(resolved), resolved.slice(0, 0)),
        check("the drawer says it was sent again", /Sent again on /.test(drawer), drawer),
        check("footer: View the e-mail, Copy the address", JSON.stringify(footer) === JSON.stringify(["View the e-mail", "Copy the address"]), footer),
      ]);
    },
  },
  {
    id: "send-to-another-address-checks-the-corrected-address",
    title: "Send to another address refuses an empty, invalid or identical address with its message, then sends to the corrected one",
    entryPoint: "/modules/mailing/sends",
    async run(/** @type {Ctx} */ ctx) {
      await seedLog(ctx);
      const tab = await openSends(ctx);
      await openRow(tab, WHO.hard);
      await tab.click({ role: "button", name: "Send to another address" });
      await wait(tab, 1000);
      const modal = await pageText(tab);
      await ctx.verify("the dialog explains", [
        check("title and description name the bounced address", /Send to another address bounce@one\.test doesn’t receive e-mail\. The same version and data go to the address you enter; it is a real send\./.test(modal), modal.slice(-700)),
        check("it reminds to update the application too", /Also update the address in your application, or the next e-mail will bounce again\./.test(modal), modal.slice(-700)),
        check("it shows the bounced address, the template and its version", /Bounced address bounce@one\.test Template order · v1/.test(modal), modal.slice(-700)),
      ]);
      const submit = { role: "button", name: "Send to this address" };
      const field = { role: "textbox", name: "Corrected address" };
      const prefilled = await tab.value(field);
      await tab.fill(field, "");
      await tab.press("Tab", field);
      const required = await tab.shows(/Enter the corrected address\./, { timeoutMs: 5000 });
      await tab.fill(field, "not-an-address");
      await tab.press("Tab", field);
      const invalid = await tab.shows(/This isn’t an e-mail address\./, { timeoutMs: 5000 });
      await tab.fill(field, "BOUNCE@one.test");
      await tab.press("Tab", field);
      const same = await tab.shows(/This is the address that bounced: enter a different one\./, { timeoutMs: 5000 });
      await ctx.verify("the corrected address is checked", [
        check("the field starts with the bounced address", prefilled === WHO.hard, prefilled),
        check("empty: Enter the corrected address.", required.pass, required.detail),
        check("not an address: This isn’t an e-mail address.", invalid.pass, invalid.detail),
        check("the same address in other letters: This is the address that bounced", same.pass, same.detail),
      ]);
      await tab.fill({ role: "textbox", name: "Corrected address" }, "corrected@one.test");
      await tab.click(submit);
      const mailed = await ctx.mail((message) => message.to.some((address) => address.includes("corrected@one.test")));
      const toasted = await tab.shows(/Sent to corrected@one\.test/, { timeoutMs: 8000 });
      await ctx.verify("the corrected address gets the e-mail", [
        check("the sink received it", mailed.match !== undefined, mailed.messages.map((message) => message.to)),
        check("a toast says Sent to corrected@one.test", toasted.pass, toasted.detail),
      ]);
    },
  },
]);
