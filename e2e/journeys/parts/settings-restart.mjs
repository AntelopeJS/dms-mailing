import { check, list, mailing, pick, text } from "../../mailing.mjs";
import { postEvent, secretOf } from "./api-kit.mjs";
import { putSettings } from "./settings-basics.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
export const settingsSurviveRestart = {
  id: "settings-categories-retention-and-a-rotated-secret-survive-a-backend-restart",
  title: "the sender, the retention, the categories and a rotated webhook secret are read back unchanged after the backend restarts, the rotated secret opens the webhook and the one it replaced stays refused",
  entryPoint: "PUT /api/mailing/settings, POST /api/mailing/settings/webhook-secret/rotate, ctx.restartBackend()",
  async run(ctx) {
    const original = await secretOf(ctx);
    const categories = [
      { id: "marketing", label: { en: "Campaigns", fr: "Campagnes" }, icon: "i-ph-megaphone" },
      { id: "restarts", label: { en: "Restarts", fr: "Redémarrages" }, icon: "i-ph-repeat" },
    ];
    const saved = await putSettings(ctx, "save the sender, the retention and the categories", { senderName: "Restart", senderEmail: "restart@example.com", replyTo: "reply@example.com", logRetentionDays: 45, categories });
    const rotated = text((await mailing(ctx, "rotate the secret", "POST", "/settings/webhook-secret/rotate")).body, "value");
    await ctx.verify("the settings are saved before the restart", [check("HTTP 200 and a new secret", saved.status === 200 && rotated !== original && /^[0-9a-f]{48}$/.test(rotated), [saved.status, saved.body])], { critical: true });

    await ctx.restartBackend();

    const read = (await mailing(ctx, "read the settings after a restart", "GET", "/settings")).body;
    const stored = list(read, "categories");
    const preview = await mailing(ctx, "preview the retention after a restart", "GET", "/settings/retention-preview");
    const fresh = await postEvent(ctx, "post with the rotated secret after a restart", { secret: rotated, body: { messageId: "restart-unknown", type: "opened" } });
    const old = await postEvent(ctx, "post with the replaced secret after a restart", { secret: original, body: { messageId: "restart-unknown", type: "opened" } });
    await ctx.verify("what was saved is what a restarted backend reads", [
      check("the sender and the reply-to", text(read, "senderName") === "Restart" && text(read, "senderEmail") === "restart@example.com" && text(read, "replyTo") === "reply@example.com", read),
      check("45 days of retention, in the settings and in the preview", pick(read, "logRetentionDays") === 45 && pick(preview.body, "days") === 45, [pick(read, "logRetentionDays"), preview.body]),
      check("the two categories, in order, with their labels and icons", JSON.stringify(stored.map((row) => [row.id, pick(row, "label", "en"), pick(row, "label", "fr"), row.icon])) === JSON.stringify(categories.map((row) => [row.id, row.label.en, row.label.fr, row.icon])), stored),
      check("the settings show the rotated secret", text(read, "webhookSecret") === rotated, "other"),
      check("the rotated secret is accepted by the webhook", fresh.status !== 403, fresh.text),
      check("the replaced secret is still refused: 403 bad_secret", old.status === 403 && pick(old.json, "reason") === "bad_secret", old.text),
    ]);
  },
};
