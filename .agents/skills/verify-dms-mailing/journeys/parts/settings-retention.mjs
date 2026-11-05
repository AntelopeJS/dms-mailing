import { check, mailing, pick, text } from "../../mailing.mjs";
import { declareLive, importSends } from "./api-kit.mjs";
import { putSettings } from "./settings-basics.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const DAY = 86_400_000;
const AGES = [2, 10, 28, 32, 80, 100, 360, 370, 3600, 3700];

/**
 * @param {Ctx} ctx The journey
 * @param {string} query The preview query
 * @returns {Promise<import("../../mailing.mjs").Answer>} The answer
 */
const preview = (ctx, query) => mailing(ctx, `preview ${query || "stored days"}`, "GET", `/settings/retention-preview${query}`);

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
export const retention = {
  id: "the-log-retention-is-bounded-and-previews-what-the-next-run-deletes",
  title: "Keep sends for takes 1 to 3650 days (0, 3651, a fraction and a text are refused, 90 is the default); the preview counts the sends older than the duration at the next 03:15 run, for a duration asked or the stored one, and refuses a duration out of bounds",
  entryPoint: "PUT /api/mailing/settings, GET /api/mailing/settings/retention-preview",
  async run(ctx) {
    const template = await declareLive(ctx, "retention-order");
    const sends = AGES.map((age) => ({ importId: `age-${age}`, templateSlug: template.slug, to: { email: ctx.email(`age${age}`) }, sentAt: { $date: new Date(Date.now() - age * DAY).toISOString() } }));
    const done = await importSends(ctx, "import sends of ten ages", sends);
    await ctx.verify("ten past sends exist", [check("imported", done.ids.length === AGES.length, done.error ?? done.result)], { critical: true });

    const stored = await preview(ctx, "");
    await ctx.verify("without a duration the preview uses the stored 90 days", [
      check("days is 90", pick(stored.body, "days") === 90, stored.body),
      check("sends of 100, 360, 370, 3600 and 3700 days are older: 5", pick(stored.body, "count") === 5, pick(stored.body, "count")),
    ]);
    const next = new Date(text(stored.body, "nextRunAt"));
    await ctx.verify("the next run is at 03:15 server time within a day", [
      check("hour 3 and minute 15 in the server's time zone", next.getHours() === 3 && next.getMinutes() === 15 && next.getSeconds() === 0, text(stored.body, "nextRunAt")),
      check("in the future and at most 24 hours away", next.getTime() > Date.now() && next.getTime() - Date.now() <= DAY, text(stored.body, "nextRunAt")),
    ]);
    /** @type {Array<[number, number]>} */
    const expected = [[1, 10], [3, 9], [30, 7], [35, 6], [90, 5], [365, 3], [3650, 1]];
    for (const [days, count] of expected) {
      const answer = await preview(ctx, `?days=${days}`);
      await ctx.verify(`${days} days: ${count} sends would go`, [check(`days ${days} and count ${count}`, pick(answer.body, "days") === days && pick(answer.body, "count") === count, answer.body)]);
    }
    for (const bad of ["0", "3651", "1.5", "ten", "-1"]) {
      const answer = await preview(ctx, `?days=${bad}`);
      await ctx.verify(`a preview of ${bad} days is refused`, [check("HTTP 400", answer.status === 400, [answer.status, answer.body])]);
    }

    for (const refused of [0, 3651, 1.5, "30", -5]) {
      const answer = await putSettings(ctx, `refuse ${refused} days`, { logRetentionDays: refused });
      await ctx.verify(`${JSON.stringify(refused)} days of retention is refused`, [check("HTTP 400", answer.status === 400, [answer.status, answer.body])]);
    }
    for (const accepted of [1, 3650, 365]) {
      const answer = await putSettings(ctx, `keep sends ${accepted} days`, { logRetentionDays: accepted });
      const read = await mailing(ctx, "read the settings", "GET", "/settings");
      await ctx.verify(`${accepted} days of retention is stored`, [check("HTTP 200 and read back", answer.status === 200 && pick(read.body, "logRetentionDays") === accepted, read.body)]);
    }
    await putSettings(ctx, "keep sends 30 days", { logRetentionDays: 30 });
    const thirty = await preview(ctx, "");
    await ctx.restartBackend();
    const restarted = await preview(ctx, "");
    await ctx.verify("the preview follows the stored duration, also after a restart", [
      check("30 days and the 7 sends older than 30 days", pick(thirty.body, "days") === 30 && pick(thirty.body, "count") === 7, thirty.body),
      check("the same after a restart", pick(restarted.body, "days") === 30 && pick(restarted.body, "count") === 7, restarted.body),
    ]);
  },
};
