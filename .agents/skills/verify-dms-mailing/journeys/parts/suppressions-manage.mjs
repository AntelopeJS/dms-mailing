import { check, list, mailing, pick, text } from "../../mailing.mjs";
import { entryOf, suppressionRows } from "./api-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const INVALID = "$dms_mailing.suppressions.errors.invalid";
const ALREADY = "$dms_mailing.suppressions.errors.already";
const NOT_FOUND = "$dms_mailing.suppressions.errors.not_found";
const MAX_NOTE = 500;

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
export const manage = {
  id: "an-address-is-added-by-hand-and-lifted-over-http",
  title: "POST /suppressions adds a trimmed lower-case address with a note of at most 500 characters, refuses a bad address with 400 and a repeat with 409, and DELETE lifts an entry once and answers 404 after",
  entryPoint: "POST /api/mailing/suppressions, DELETE /api/mailing/suppressions/:id",
  async run(ctx) {
    const address = ctx.email("Manual");
    const bad = await mailing(ctx, "add an invalid address", "POST", "/suppressions", { body: { email: "nope" } });
    await ctx.verify("an invalid address is refused", [
      check("HTTP 400", bad.status === 400, bad.status),
      check("the generic message", text(bad.body, "message") === INVALID, bad.body),
      check("the issue sits under the email field", JSON.stringify(list(bad.body, "issues")[0]?.path) === '["email"]', bad.body),
    ]);
    const empty = await mailing(ctx, "add nothing", "POST", "/suppressions", { body: {} });
    await ctx.verify("a body without an address is refused", [check("HTTP 400", empty.status === 400, empty.body), check("the generic message", text(empty.body, "message") === INVALID, empty.body)]);

    const long = await mailing(ctx, "add with a note of 501 characters", "POST", "/suppressions", { body: { email: address, note: "x".repeat(MAX_NOTE + 1) } });
    await ctx.verify("a note of 501 characters is refused", [
      check("HTTP 400", long.status === 400, long.status),
      check("the issue sits under the note field", JSON.stringify(list(long.body, "issues")[0]?.path) === '["note"]', long.body),
      check("nothing was added", entryOf(await suppressionRows(ctx), address.toLowerCase()) === undefined, "listed"),
    ]);

    const added = await mailing(ctx, "add with a note of 500 characters and spaces around the address", "POST", "/suppressions", { body: { email: `  ${address.toUpperCase()}  `, note: "y".repeat(MAX_NOTE) } });
    const entry = entryOf(await suppressionRows(ctx), address.toLowerCase());
    await ctx.verify("a note of 500 characters is accepted", [
      check("HTTP 200 added", added.status === 200 && pick(added.body, "added") === true, added.body),
      check("the address is stored trimmed and in lower case", entry !== undefined, address.toLowerCase()),
      check("the reason is manual", text(entry, "reason") === "manual", entry),
      check("the whole note is kept as the detail", text(entry, "detail") === "y".repeat(MAX_NOTE), text(entry, "detail").length),
      check("no send is attached", text(entry, "sendId") === "", entry?.sendId),
    ], { critical: true });

    const again = await mailing(ctx, "add the same address in capitals", "POST", "/suppressions", { body: { email: address.toUpperCase() } });
    await ctx.verify("an address already on the list is refused", [
      check("HTTP 409", again.status === 409, again.status),
      check("the already-listed message", text(again.body, "message") === ALREADY, again.body),
      check("the issue sits under the email field", JSON.stringify(list(again.body, "issues")[0]?.path) === '["email"]', again.body),
      check("still one entry", (await suppressionRows(ctx)).filter((row) => text(row, "email") === address.toLowerCase()).length === 1, "count"),
    ]);

    const blankNote = ctx.email("blank-note");
    await mailing(ctx, "add with a blank note", "POST", "/suppressions", { body: { email: blankNote, note: "   " } });
    const blank = entryOf(await suppressionRows(ctx), blankNote);
    await ctx.verify("a blank note leaves no detail", [check("no detail", (text(blank, "detail") || "") === "", blank?.detail)]);

    const lifted = await mailing(ctx, "reactivate the address", "DELETE", `/suppressions/${text(entry, "_id")}`);
    await ctx.verify("an entry is lifted", [
      check("HTTP 200 removed", lifted.status === 200 && pick(lifted.body, "removed") === true, lifted.body),
      check("the entry is gone", entryOf(await suppressionRows(ctx), address.toLowerCase()) === undefined, "listed"),
    ]);
    const twice = await mailing(ctx, "reactivate it again", "DELETE", `/suppressions/${text(entry, "_id")}`);
    await ctx.verify("a lifted entry cannot be lifted twice", [
      check("HTTP 404", twice.status === 404, twice.status),
      check("the not-listed message", twice.body === NOT_FOUND, twice.body),
    ]);
    const readded = await mailing(ctx, "add the lifted address again", "POST", "/suppressions", { body: { email: address } });
    await ctx.verify("a lifted address can be added again", [check("HTTP 200", readded.status === 200, readded.body)]);
    const anonymous = await mailing(ctx, "add as nobody", "POST", "/suppressions", { body: { email: ctx.email("nobody") }, as: "anon" });
    await ctx.verify("the routes need a session", [check("HTTP 401", anonymous.status === 401, anonymous.status)]);
  },
};
