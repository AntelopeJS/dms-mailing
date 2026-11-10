import { readFileSync } from "node:fs";
import { check, list, mailing, pick, text } from "../../mailing.mjs";
import { declareLive, postEvent, secretOf, sendCode } from "./api-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const INVALID = "$dms_mailing.errors.invalid_settings";
const DEFAULT_CATEGORIES = [
  ["orders", "Orders", "Commandes", "i-ph-package"],
  ["account", "Account & access", "Compte et accès", "i-ph-lock"],
  ["billing", "Billing", "Facturation", "i-ph-file-text"],
  ["marketing", "Marketing", "Marketing", "i-ph-sparkle"],
  ["forms", "Forms", "Formulaires", "i-ph-textbox"],
];

/**
 * @param {Ctx} ctx The journey
 * @param {string} label What the call does
 * @param {unknown} body The patch
 */
export const putSettings = (ctx, label, body) => mailing(ctx, label, "PUT", "/settings", { body });

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} */
export const basicsJourneys = [
  {
    id: "a-new-workspace-starts-on-the-documented-defaults",
    title: "a workspace that never opened Mailing has no webhook secret (403 bad_secret); reading the settings creates them with the documented defaults, a 48 hexadecimal character secret kept across reads, the webhook URL and the provider read-only",
    entryPoint: "GET /api/mailing/settings",
    async run(ctx) {
      const before = await postEvent(ctx, "an event before any settings exist", { secret: "a".repeat(48), body: { messageId: "x", type: "opened" } });
      await ctx.verify("without settings the webhook answers 403 bad_secret", [check("403 bad_secret", before.status === 403 && pick(before.json, "reason") === "bad_secret", before.text)]);
      const read = await mailing(ctx, "read the settings", "GET", "/settings");
      const body = read.body;
      const categories = list(body, "categories");
      await ctx.verify("the defaults of the Configuration page", [
        check("fallback locale en", pick(body, "fallbackLocale") === "en", pick(body, "fallbackLocale")),
        check("keep sends for 90 days", pick(body, "logRetentionDays") === 90, pick(body, "logRetentionDays")),
        check("missing variables: Send anyway", pick(body, "blockOnMissingVariables") === false && pick(body, "missingVariables") === "send", [pick(body, "blockOnMissingVariables"), pick(body, "missingVariables")]),
        check("no sender name, address or reply-to", pick(body, "senderName") === "" && pick(body, "senderEmail") === "" && pick(body, "replyTo") === "", [pick(body, "senderName"), pick(body, "senderEmail"), pick(body, "replyTo")]),
        check("a generated secret of 48 hexadecimal characters", /^[0-9a-f]{48}$/.test(text(body, "webhookSecret")), text(body, "webhookSecret")),
        check("the provider is read-only: the e-mail interface implementation", pick(body, "provider") === "nodemailer", pick(body, "provider")),
        check("the webhook URL is <dashboard origin>/api/mailing/events/<provider>/<tenant>", pick(body, "webhookUrl") === `${ctx.state.webUrl}/api/mailing/events/nodemailer/default`, pick(body, "webhookUrl")),
        check("five categories in order", JSON.stringify(categories.map((entry) => entry.id)) === JSON.stringify(DEFAULT_CATEGORIES.map(([id]) => id)), categories.map((entry) => entry.id)),
        ...DEFAULT_CATEGORIES.map(([id, en, fr, icon], index) => check(`${id}: labels and icon`, text(categories[index], "icon") === icon && text(categories[index], "label", "en") === en && text(categories[index], "label", "fr") === fr, categories[index])),
      ]);
      const again = await mailing(ctx, "read the settings again", "GET", "/settings");
      const status = await mailing(ctx, "read the webhook status", "GET", "/settings/webhook-status");
      const works = await postEvent(ctx, "an event with the secret", { secret: text(body, "webhookSecret"), body: { messageId: "x", type: "opened" } });
      await ctx.verify("the secret is stable and opens the webhook", [
        check("the same secret", text(again.body, "webhookSecret") === text(body, "webhookSecret"), "changed"),
        check("the webhook accepts it", works.status === 200, works.text),
        check("no event had been received or refused before", JSON.stringify(status.body) === '{"lastReceived":null,"lastRefused":null}', status.body),
      ]);
    },
  },
  {
    id: "a-settings-write-is-a-checked-patch",
    title: "PUT /settings changes only the fields it carries, refuses unknown and read-only fields with 400, checks each field's rules and bounds, stores a cleared field as empty, and what it stored survives a backend restart",
    entryPoint: "PUT /api/mailing/settings",
    async run(ctx) {
      await mailing(ctx, "open the settings", "GET", "/settings");
      const refused = async (/** @type {string} */ name, /** @type {unknown} */ patch) => {
        const answer = await putSettings(ctx, `refuse ${name}`, patch);
        return check(`${name}: 400 with the generic message`, answer.status === 400 && (text(answer.body, "message") === INVALID || answer.body === INVALID), [answer.status, answer.body]);
      };
      await ctx.verify("unknown and read-only fields are refused", [
        await refused("an unknown field", { nothing: 1 }),
        await refused("webhookUrl", { webhookUrl: "https://x.example" }),
        await refused("provider", { provider: "other" }),
        await refused("a body that is not an object", [1]),
      ]);
      await ctx.verify("field rules", [
        await refused("a locale that is not well formed", { fallbackLocale: "not a locale!" }),
        await refused("an empty fallback locale", { fallbackLocale: "" }),
        await refused("an address without a domain", { senderEmail: "nobody" }),
        await refused("a reply-to that is not an address", { replyTo: "reply at acme" }),
        await refused("a sender name of 121 characters", { senderName: "n".repeat(121) }),
        await refused("a sender name with a control character", { senderName: "Ac\u0007me" }),
        await refused("a missing-variables choice that does not exist", { missingVariables: "maybe" }),
        await refused("a boolean given as text", { blockOnMissingVariables: "yes" }),
      ]);
      const first = await putSettings(ctx, "set the sender name and a 120 character limit", { senderName: "n".repeat(120), senderEmail: "  Hello@Acme.Example ", replyTo: "reply@bücher.example" });
      const read = await mailing(ctx, "read the settings", "GET", "/settings");
      await ctx.verify("valid values are stored trimmed and with the domain in ASCII", [
        check("HTTP 200", first.status === 200, first.body),
        check("a name of 120 characters is kept", text(read.body, "senderName") === "n".repeat(120), text(read.body, "senderName").length),
        check("the address is trimmed and its domain lower-cased", text(read.body, "senderEmail") === "Hello@acme.example", text(read.body, "senderEmail")),
        check("the domain of the reply-to is punycode", text(read.body, "replyTo") === "reply@xn--bcher-kva.example", text(read.body, "replyTo")),
      ]);
      await putSettings(ctx, "change the retention only", { logRetentionDays: 30 });
      const patched = await mailing(ctx, "read the settings", "GET", "/settings");
      await ctx.verify("a write carries only the changed fields", [
        check("retention is 30", pick(patched.body, "logRetentionDays") === 30, pick(patched.body, "logRetentionDays")),
        check("the sender is untouched", text(patched.body, "senderName") === "n".repeat(120) && text(patched.body, "senderEmail") === "Hello@acme.example", patched.body),
        check("the secret is untouched", text(patched.body, "webhookSecret") === text(read.body, "webhookSecret"), "changed"),
      ]);
      const cleared = await putSettings(ctx, "clear the sender and reply-to with null", { senderEmail: null, replyTo: null, senderName: null });
      const empty = await mailing(ctx, "read the settings", "GET", "/settings");
      await ctx.verify("null clears a field to empty", [
        check("HTTP 200", cleared.status === 200, cleared.body),
        check("the three are empty", text(empty.body, "senderName") === "" && text(empty.body, "senderEmail") === "" && text(empty.body, "replyTo") === "", empty.body),
      ]);
      const name = await putSettings(ctx, "set a sender name without an address", { senderName: "Acme" });
      const both = await putSettings(ctx, "set an address", { senderEmail: "hello@acme.example", fallbackLocale: "fr" });
      await ctx.verify("a sender name without an address answers a warning", [
        check("the warning notice", text(pick(name.body, "notice"), "title") === "$dms_mailing.settings.sender_name_ignored" && text(pick(name.body, "notice"), "color") === "warning", name.body),
        check("no warning once the address is there", pick(both.body, "notice") === undefined, both.body),
      ]);
      await ctx.restartBackend();
      const restarted = await mailing(ctx, "read the settings after a restart", "GET", "/settings");
      await ctx.verify("the settings survive a backend restart", [
        check("the sender and the locale are stored", text(restarted.body, "senderName") === "Acme" && text(restarted.body, "senderEmail") === "hello@acme.example" && text(restarted.body, "fallbackLocale") === "fr", restarted.body),
        check("the retention is stored", pick(restarted.body, "logRetentionDays") === 30, pick(restarted.body, "logRetentionDays")),
      ]);
    },
  },
  {
    id: "the-sender-settings-decide-who-every-e-mail-comes-from",
    title: "with a sender address, every e-mail comes from it with the sender name next to it and answers go to the reply-to; a name without an address changes nothing; without a reply-to there is no Reply-To header; the three send paths agree",
    entryPoint: "SendTemplate, POST /api/mailing/templates/:id/{test-send,send}",
    async run(ctx) {
      const template = await declareLive(ctx, "sender-order");
      const headersOf = async (/** @type {string} */ recipient) => {
        const arrived = await ctx.mail((message) => message.to.some((address) => address.includes(recipient)));
        const file = arrived.match?.file;
        const head = file ? readFileSync(file, "utf8").split(/\r?\n\r?\n/)[0] : "";
        return head.replace(/\r?\n[ \t]+/g, " ");
      };
      const to = ctx.email("sender");
      await sendCode(ctx, "send with the defaults", template.slug, { to, variables: {} });
      const plain = await headersOf(to);
      await ctx.verify("by default mail comes from the provider's default address, with no reply-to", [
        check("From is the provider's address", /^From: verify@dms-mailing\.local$/m.test(plain), plain),
        check("no Reply-To", !/^Reply-To:/im.test(plain), plain),
      ]);
      await putSettings(ctx, "set a name only", { senderName: "Acme Shop" });
      const nameOnly = ctx.email("name-only");
      await sendCode(ctx, "send with a name and no address", template.slug, { to: nameOnly, variables: {} });
      const nameHead = await headersOf(nameOnly);
      await ctx.verify("a name without an address is not used", [check("From is still the provider's address, without the name", /^From: verify@dms-mailing\.local$/m.test(nameHead) && !nameHead.includes("Acme Shop"), nameHead)]);
      await putSettings(ctx, "set the address", { senderEmail: "hello@acme.example" });
      const withAddress = ctx.email("with-address");
      await sendCode(ctx, "send with name and address", template.slug, { to: withAddress, variables: {} });
      const addressHead = await headersOf(withAddress);
      await ctx.verify("name and address together", [
        check("From carries the name and the address", /^From: "?Acme Shop"? <hello@acme\.example>$/m.test(addressHead), addressHead),
        check("still no Reply-To", !/^Reply-To:/im.test(addressHead), addressHead),
      ]);
      await putSettings(ctx, "set a reply-to", { replyTo: "answers@acme.example" });
      const viaTest = ctx.email("via-test");
      const viaReal = ctx.email("via-real");
      const viaCode = ctx.email("via-code");
      await mailing(ctx, "test send", "POST", `/templates/${template.id}/test-send`, { body: { to: [viaTest] } });
      await mailing(ctx, "real send", "POST", `/templates/${template.id}/send`, { body: { to: [viaReal] } });
      await sendCode(ctx, "SendTemplate", template.slug, { to: viaCode, variables: {} });
      const heads = await Promise.all([viaTest, viaReal, viaCode].map(headersOf));
      await ctx.verify("every send path uses the sender and the reply-to", heads.map((head, index) => check(`${["test send", "real send", "SendTemplate"][index]}: From and Reply-To`, /^From: "?Acme Shop"? <hello@acme\.example>$/m.test(head) && /^Reply-To: answers@acme\.example$/m.test(head), head)));
      await putSettings(ctx, "clear the address", { senderEmail: null });
      const back = ctx.email("back");
      await sendCode(ctx, "send after clearing the address", template.slug, { to: back, variables: {} });
      const backHead = await headersOf(back);
      await ctx.verify("clearing the address puts the provider's default back", [check("From is the provider's address again", /^From: verify@dms-mailing\.local$/m.test(backHead), backHead)]);
      const secret = await secretOf(ctx);
      await ctx.verify("the settings kept the secret throughout", [check("48 characters", secret.length === 48, secret.length)]);
    },
  },
];
