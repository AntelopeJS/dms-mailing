import { check, mailing, pick, text } from "../../mailing.mjs";
import { declareLive, importSends, postEvent, secretOf } from "./api-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */
/** @typedef {import("../../mailing.mjs").Tab} Tab */

export const PAGE = "/modules/mailing/settings";
const SECTIONS = ["Sender", "Delivery guards", "Provider & webhook", "Log retention", "Template categories"];

/**
 * Opens the settings page on a signed-in tab.
 *
 * @param {Ctx} ctx The journey
 * @returns {Promise<Tab>} The tab
 */
export async function openSettings(ctx) {
  const tab = await ctx.tab();
  await tab.signIn("admin");
  await tab.goto(PAGE);
  return tab;
}

/**
 * Fills a field again until the save bar shows that the form took the change (the page hydrates after load).
 *
 * @param {Tab} tab The tab
 * @param {Parameters<Tab["fill"]>[0]} target The field
 * @param {string} value The new value
 */
export async function fillUntilChanged(tab, target, value) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await tab.fill(target, value);
    if ((await tab.visible({ role: "button", name: "Save changes" }, { timeoutMs: 1500 })).pass) return;
  }
}

/**
 * Clicks until the save bar offers Save changes, then saves.
 *
 * @param {Tab} tab The tab
 */
export async function saveChanges(tab) {
  await tab.click({ role: "button", name: "Save changes" });
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} */
export const pageJourneys = [
  {
    id: "the-settings-page-has-five-sections-and-the-save-bar-saves-the-changes",
    title: "Configure › Settings shows five sections in its side navigation, the save bar appears on a change, Discard puts the saved values back, Save changes stores them (toast Settings saved), and a field changed elsewhere in the meantime is not overwritten",
    entryPoint: PAGE,
    async run(ctx) {
      await mailing(ctx, "open the settings", "GET", "/settings");
      const tab = await openSettings(ctx);
      await ctx.verify("five sections in the side navigation, with their headings", [
        ...SECTIONS.map((name) => tab.visible({ role: "link", name, within: { role: "navigation", name: "Sections" } })),
        ...SECTIONS.map((name) => tab.visible({ role: "heading", name, exact: true })),
        tab.count({ role: "link", within: { role: "navigation", name: "Sections" } }, 5),
        tab.visible({ role: "button", name: "Save changes" }, { hidden: true, timeoutMs: 2500 }),
      ]);
      await fillUntilChanged(tab, { role: "textbox", name: "Sender name" }, "Typed Name");
      await ctx.verify("a change raises the save bar", [tab.visible({ role: "button", name: "Save changes" }), tab.visible({ role: "button", name: "Discard" })]);
      await tab.click({ role: "button", name: "Discard" });
      await ctx.verify("Discard puts the saved value back", [
        tab.visible({ role: "button", name: "Save changes" }, { hidden: true }),
        check("the field is empty again", (await tab.value({ role: "textbox", name: "Sender name" })) === "", "value"),
        check("nothing was stored", text((await mailing(ctx, "read the settings", "GET", "/settings")).body, "senderName") === "", "stored"),
      ]);

      await tab.fill({ role: "textbox", name: "Sender name" }, "Typed Name");
      await tab.fill({ role: "textbox", name: "Sender address" }, "typed@shop.example");
      await tab.fill({ role: "textbox", name: "Reply-to address" }, "answers@shop.example");
      await tab.click({ role: "radio", name: "Refuse the send" });
      await mailing(ctx, "change the retention elsewhere", "PUT", "/settings", { body: { logRetentionDays: 45 } });
      await saveChanges(tab);
      await ctx.verify("Save changes stores the edited fields only", [tab.shows(/Settings saved/)]);
      const stored = (await mailing(ctx, "read the settings", "GET", "/settings")).body;
      await ctx.verify("the API holds what the page saved, and the field changed elsewhere stayed", [
        check("sender name, address and reply-to", text(stored, "senderName") === "Typed Name" && text(stored, "senderEmail") === "typed@shop.example" && text(stored, "replyTo") === "answers@shop.example", stored),
        check("Refuse the send", pick(stored, "missingVariables") === "refuse" && pick(stored, "blockOnMissingVariables") === true, pick(stored, "missingVariables")),
        check("the retention changed elsewhere is untouched", pick(stored, "logRetentionDays") === 45, pick(stored, "logRetentionDays")),
      ]);
      await tab.reload();
      await ctx.verify("a reload shows the saved values", [
        check("sender name", (await tab.value({ role: "textbox", name: "Sender name" })) === "Typed Name", "value"),
        check("sender address", (await tab.value({ role: "textbox", name: "Sender address" })) === "typed@shop.example", "value"),
        check("reply-to", (await tab.value({ role: "textbox", name: "Reply-to address" })) === "answers@shop.example", "value"),
        tab.visible({ role: "radio", name: "Refuse the send" }),
        check("Refuse the send is the checked choice", await tab.locator({ role: "radio", name: "Refuse the send" }).isChecked(), "unchecked"),
      ]);
      await tab.click({ role: "combobox" });
      await ctx.verify("the fallback locale offers the workspace locales only", [
        tab.visible({ role: "option", name: /English/ }),
        tab.visible({ role: "option", name: /French/ }),
        tab.count({ role: "option" }, 2),
        tab.shows(/Workspace locales: EN, FR/),
      ]);
      await tab.click({ role: "option", name: /French/ });
      await saveChanges(tab);
      await ctx.verify("the chosen fallback locale is stored", [tab.shows(/Settings saved/), check("fr", text((await mailing(ctx, "read the settings", "GET", "/settings")).body, "fallbackLocale") === "fr", "stored")]);
      await tab.fill({ role: "textbox", name: "Sender name" }, "Only a name");
      await tab.fill({ role: "textbox", name: "Sender address" }, "");
      await saveChanges(tab);
      await ctx.verify("a sender name without an address saves with a warning", [tab.shows(/The sender name is only used with a sender address\./)]);
    },
  },
  {
    id: "the-webhook-section-shows-the-secret-rotates-it-and-tests-the-url",
    title: "the Provider & webhook section shows the provider and the copyable webhook URL, hides the secret until Show, replaces it on Rotate… after a confirmation (the old one stops working), reports the last event and the last refused call, and Send a test event proves the URL",
    entryPoint: PAGE,
    async run(ctx) {
      const template = await declareLive(ctx, "page-webhook-order");
      const secret = await secretOf(ctx);
      await importSends(ctx, "import a send", [{ importId: "pw", templateSlug: template.slug, to: { email: ctx.email("pw") }, sentAt: { $date: new Date(Date.now() - 60_000).toISOString() }, providerMessageId: "pw-1" }]);
      const tab = await openSettings(ctx);
      const url = text((await mailing(ctx, "read the settings", "GET", "/settings")).body, "webhookUrl");
      await ctx.verify("the provider, the URL and the masked secret", [
        tab.shows(/nodemailer/),
        check("the webhook URL field holds the URL", (await tab.value({ role: "textbox", name: "Webhook URL" })) === url, "value"),
        check("the secret is masked and ends with its last four characters", new RegExp(`^•+${secret.slice(-4)}$`).test(await tab.value({ role: "textbox", name: "Webhook secret" })), await tab.value({ role: "textbox", name: "Webhook secret" })),
        tab.shows(/No event received yet/),
      ]);
      for (let attempt = 0; attempt < 8 && (await tab.value({ role: "textbox", name: "Webhook secret" })) !== secret; attempt += 1) await tab.click({ role: "button", name: "Show" });
      await ctx.verify("Show reveals the secret", [check("the whole secret", (await tab.value({ role: "textbox", name: "Webhook secret" })) === secret, "value")]);

      await postEvent(ctx, "a refused call", { secret: "z".repeat(48), provider: "postmark", body: { messageId: "pw-1", type: "opened" } });
      await postEvent(ctx, "an unmatched event", { secret, provider: "postmark", body: { messageId: "nobody", type: "opened" } });
      await tab.reload();
      await ctx.verify("the status shows the last event received and the last refused call", [
        tab.shows(/Last event: opened, from postmark, matching no send/),
        tab.shows(/Last refused call, from postmark: wrong secret \(it changes when rotated\)/),
      ]);
      await postEvent(ctx, "a matched event", { secret, provider: "postmark", body: { messageId: "pw-1", type: "delivered" } });
      await postEvent(ctx, "a call without the header", { provider: "brevo", body: { messageId: "pw-1", type: "delivered" } });
      await tab.reload();
      await ctx.verify("a matched event and a missing header read as such", [
        tab.shows(/Last event: delivered, from postmark(?!, matching)/),
        tab.shows(/Last refused call, from brevo: no x-mailing-webhook-secret header/),
      ]);
      await postEvent(ctx, "a malformed event", { secret, provider: "mailgun", rawBody: "{}" });
      await tab.reload();
      await ctx.verify("a malformed body reads as such", [tab.shows(/Last refused call, from mailgun: the body is not a mailing event/)]);

      await tab.click({ role: "button", name: "Send a test event" });
      await ctx.verify("Send a test event reports the delivery and updates the status", [
        tab.shows(/Test event received in \d+ ms/),
        tab.shows(/Last event: the test event/),
      ]);
      await tab.click({ role: "button", name: "Rotate…" });
      await tab.click({ role: "button", name: /^Rotate/, within: { role: "dialog" } });
      const rotated = await secretOf(ctx);
      const oldTry = await postEvent(ctx, "post with the old secret", { secret, body: { messageId: "pw-1", type: "opened" } });
      await ctx.verify("Rotate… replaces the secret and the old one stops working", [
        check("the settings hold a new secret", rotated !== secret && /^[0-9a-f]{48}$/.test(rotated), rotated),
        check("the old secret is refused", oldTry.status === 403, oldTry.status),
      ]);
    },
  },
];
