import { check, list, member, pick, text } from "../../mailing.mjs";
import { declareLive, importSends, postEvent, secretOf } from "./api-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const INBOX = "/dms/pages/settings/user/notifications/inbox";
const MINUTE = 60_000;

/**
 * @param {Ctx} ctx The journey
 * @param {string} slug The template
 * @param {{ prefix: string, count: number, minutesAgo: number, isTest?: boolean }} batch The message id prefix, how many sends, how old, whether tests
 */
async function bulk(ctx, slug, batch) {
  const { prefix, count, minutesAgo, isTest = false } = batch;
  const sentAt = { $date: new Date(Date.now() - minutesAgo * MINUTE).toISOString() };
  const sends = Array.from({ length: count }, (_, index) => ({ importId: `${prefix}${index}`, templateSlug: slug, to: { email: `${prefix}${index}@verify.local` }, sentAt, providerMessageId: `${prefix}${index}`, isTest }));
  const done = await importSends(ctx, `import ${count} sends of ${slug}`, sends);
  await ctx.verify(`${count} sends of ${slug} exist`, [check("all imported", done.ids.length === count, done.error ?? done.result)], { critical: true });
  return done.ids;
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
export const notify = {
  id: "owners-get-one-bell-notification-per-template-and-hour-at-three-problems-and-five-percent",
  title: "the tenant owners get one bell notification per template and clock hour once at least 3 of its real sends of the last hour bounced, failed or were reported as spam and they make at least 5%; fewer, a lower rate, tests, unsubscriptions and older sends do not count; a member who is not an owner gets none",
  entryPoint: "POST /api/mailing/events/:provider/:tenantId, the bell inbox",
  async run(ctx) {
    const secret = await secretOf(ctx);
    const startHour = Math.floor(Date.now() / (60 * MINUTE));
    const names = ["rate", "count", "types", "tests", "old", "window"];
    for (const name of names) await declareLive(ctx, name);
    const fire = (/** @type {string} */ id, /** @type {string} */ type) => postEvent(ctx, `${id} ${type}`, { secret, body: { messageId: id, type } });
    const inbox = async () => list((await ctx.api("read the owner's bell", { method: "GET", path: INBOX, as: "admin" })).body, "results");
    const SETTLE_MS = 2500;
    const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const forSlug = async (/** @type {string} */ slug) => {
      await settle();
      return (await inbox()).filter((row) => text(pick(row, "params"), "slug") === slug);
    };

    await bulk(ctx, "rate", { prefix: "rate", count: 100, minutesAgo: 10 });
    for (let index = 0; index < 4; index += 1) await fire(`rate${index}`, "bounced");
    await ctx.verify("4 problems in 100 sends is 4%: no notification", [check("none for rate", (await forSlug("rate")).length === 0, await inbox())]);
    await fire("rate4", "bounced");
    const rate = await forSlug("rate");
    await ctx.verify("5 problems in 100 sends is 5%: one notification", [
      check("one notification", rate.length === 1, rate.length),
      check("its params say 5 problems at 5%", pick(rate[0], "params", "count") === 5 && pick(rate[0], "params", "rate") === 5, pick(rate[0], "params")),
      check("it links to the Problems view of the send that tipped it", text(rate[0], "linkTo").startsWith("/modules/mailing/sends?view=problems&record="), rate[0]?.linkTo),
      check("it is unread and carries the module's texts", pick(rate[0], "isRead") === false && text(rate[0], "title") === "$dms_mailing.notifications.problems_title", rate[0]),
    ]);

    await bulk(ctx, "count", { prefix: "count", count: 10, minutesAgo: 10 });
    await fire("count0", "bounced");
    await fire("count1", "failed");
    await ctx.verify("2 problems in 10 sends is 20% but only 2: no notification", [check("none for count", (await forSlug("count")).length === 0, await inbox())]);
    await fire("count2", "spam");
    await fire("count3", "bounced");
    await fire("count4", "failed");
    const count = await forSlug("count");
    await ctx.verify("the third problem notifies, later ones add nothing within the hour", [
      check("one notification after five problems", count.length === 1, count.length),
      check("it was raised by the third problem: 3 at 30%", pick(count[0], "params", "count") === 3 && pick(count[0], "params", "rate") === 30, pick(count[0], "params")),
    ]);

    await bulk(ctx, "types", { prefix: "types", count: 10, minutesAgo: 10 });
    for (const id of ["types0", "types1", "types2"]) await fire(id, "unsubscribed");
    for (const id of ["types3", "types4"]) await fire(id, "opened");
    await ctx.verify("unsubscriptions and opens are no problems", [check("none for types", (await forSlug("types")).length === 0, await inbox())]);
    await fire("types5", "spam");
    await fire("types6", "failed");
    await fire("types7", "bounced");
    await ctx.verify("spam, failed and bounced together are three problems", [check("one for types", (await forSlug("types")).length === 1, await inbox())]);

    await bulk(ctx, "tests", { prefix: "tests", count: 10, minutesAgo: 10, isTest: true });
    await bulk(ctx, "tests", { prefix: "treal", count: 10, minutesAgo: 10 });
    for (const id of ["tests0", "tests1", "tests2", "tests3"]) await fire(id, "bounced");
    await ctx.verify("problems of test sends never notify", [check("none for tests", (await forSlug("tests")).length === 0, await inbox())]);
    await fire("treal0", "bounced");
    await fire("treal1", "failed");
    await ctx.verify("test sends are not counted in a template's problems either: 2 real problems after 4 test ones", [check("still none for tests", (await forSlug("tests")).length === 0, await inbox())]);

    await bulk(ctx, "old", { prefix: "old", count: 10, minutesAgo: 70 });
    for (const id of ["old0", "old1", "old2"]) await fire(id, "bounced");
    await ctx.verify("sends of more than an hour ago are not in the window", [check("none for old", (await forSlug("old")).length === 0, await inbox())]);

    await bulk(ctx, "window", { prefix: "wold", count: 3, minutesAgo: 65 });
    await bulk(ctx, "window", { prefix: "wnew", count: 7, minutesAgo: 50 });
    for (const id of ["wold0", "wold1", "wold2", "wnew0", "wnew1"]) await fire(id, "bounced");
    await ctx.verify("two recent problems and three old ones: still no notification", [check("none for window", (await forSlug("window")).length === 0, await inbox())]);
    await fire("wnew2", "bounced");
    const window = await forSlug("window");
    await ctx.verify("the third recent problem notifies; the old sends are outside the rate too", [
      check("one for window", window.length === 1, window.length),
      check("3 problems at 43% (3 of 7 sends of the hour)", pick(window[0], "params", "count") === 3 && pick(window[0], "params", "rate") === 43, pick(window[0], "params")),
    ]);

    const crossed = Math.floor(Date.now() / (60 * MINUTE)) !== startHour;
    await settle();
    const all = await inbox();
    await ctx.verify("exactly one notification for each of the four templates that crossed the threshold", [
      check("four notifications (the hour did not change mid-journey)", crossed ? all.length >= 4 : all.length === 4, all.map((row) => pick(row, "params", "slug"))),
      check("the templates are rate, count, types and window", ["rate", "count", "types", "window"].every((slug) => all.some((row) => text(pick(row, "params"), "slug") === slug)), all.map((row) => pick(row, "params", "slug"))),
    ]);

    await member(ctx, "viewer", ["mailing.send"]);
    const theirs = await ctx.api("read a member's bell", { method: "GET", path: INBOX, as: "viewer" });
    await ctx.verify("a member who is not an owner gets none", [check("200 and no mailing problems notification", theirs.status === 200 && list(theirs.body, "results").every((row) => !text(row, "title").startsWith("$dms_mailing.")), theirs.body)]);
  },
};
