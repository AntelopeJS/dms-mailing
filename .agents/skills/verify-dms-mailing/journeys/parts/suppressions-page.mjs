import { check, mailing, pick, text } from "../../mailing.mjs";
import { declareLive, entryOf, importSends, postEvent, secretOf, sendCode, suppressionRows } from "./api-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const PAGE = "/modules/mailing/suppressions";
const TAB_NAMES = { hard: "Hard bounce", spam: "Spam complaint", unsubscribed: "Unsubscribed", manual: "Added by hand" };

/** The rows of the docs figure: three hard bounces, two spam complaints, an unsubscription and two entries by hand. */
const SEED = [
  { key: "hard1", type: "bounced", details: { bounceType: "hard", reason: "550 5.1.1 No such user" } },
  { key: "hard2", type: "bounced", details: { bounceType: "permanent" } },
  { key: "hard3", type: "bounced", details: { reason: "553 mailbox name not allowed" } },
  { key: "spam1", type: "spam" },
  { key: "spam2", type: "spam" },
  { key: "unsub1", type: "unsubscribed" },
];
const MANUAL = ["manual1", "manual2"];

/**
 * @param {string} email A seeded address
 * @returns {RegExp} A pattern for its row's name
 */
const rowOf = (email) => new RegExp(`^${email.replace(/[+.]/g, "\\$&")}`);

/**
 * Seeds the list through the webhook and the API.
 *
 * @param {Ctx} ctx The journey
 * @returns {Promise<Record<string, string>>} The address of each key
 */
async function seed(ctx) {
  const template = await declareLive(ctx, "page-order");
  const secret = await secretOf(ctx);
  const addresses = Object.fromEntries([...SEED.map(({ key }) => key), ...MANUAL].map((key) => [key, ctx.email(key)]));
  const sentAt = { $date: new Date(Date.now() - 600_000).toISOString() };
  await importSends(ctx, "import the sends that bounce", SEED.map(({ key }) => ({ importId: key, templateSlug: template.slug, to: { email: addresses[key] }, sentAt, providerMessageId: key })));
  for (const entry of SEED) await postEvent(ctx, `post ${entry.key}`, { secret, body: { messageId: entry.key, type: entry.type, details: entry.details } });
  for (const key of MANUAL) await mailing(ctx, `add ${key}`, "POST", "/suppressions", { body: { email: addresses[key], note: `note of ${key}` } });
  return addresses;
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} */
export const pageJourneys = [
  {
    id: "the-tabs-filter-the-list-by-reason",
    title: "the Suppression list page counts and filters its entries by reason in the tabs All, Hard bounce, Spam complaint, Unsubscribed and Added by hand, and searches by address or note",
    entryPoint: PAGE,
    async run(ctx) {
      const addresses = await seed(ctx);
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto(PAGE);
      /** @type {Array<[string, number, string[]]>} */
      const views = [
        ["All", 8, Object.keys(addresses)],
        [TAB_NAMES.hard, 3, ["hard1", "hard2", "hard3"]],
        [TAB_NAMES.spam, 2, ["spam1", "spam2"]],
        [TAB_NAMES.unsubscribed, 1, ["unsub1"]],
        [TAB_NAMES.manual, 2, MANUAL],
      ];
      await ctx.verify("the tabs carry the counts of the figure", views.map(([name, count]) => tab.visible({ role: "button", name: new RegExp(`^${name} ${String(count)}$`) })));
      for (const [name, count, keys] of views) {
        await tab.click({ role: "button", name: new RegExp(`^${name} ${String(count)}$`) });
        const others = Object.keys(addresses).filter((key) => !keys.includes(key));
        await ctx.verify(`the ${name} tab holds ${count} rows`, [
          ...keys.map((key) => tab.visible({ role: "row", name: rowOf(addresses[key]) })),
          ...others.map((key) => tab.visible({ role: "row", name: rowOf(addresses[key]) }, { hidden: true, timeoutMs: 4000 })),
        ]);
      }
      await tab.click({ role: "button", name: /^All 8$/ });
      await tab.click({ role: "button", name: "Open search" });
      await tab.fill({ role: "textbox", name: "Address or note" }, "note of manual2");
      await ctx.verify("a search by note finds the entry added by hand with that note", [
        tab.visible({ role: "row", name: rowOf(addresses.manual2) }),
        tab.visible({ role: "row", name: rowOf(addresses.manual1) }, { hidden: true }),
        tab.visible({ role: "row", name: rowOf(addresses.hard1) }, { hidden: true }),
      ]);
    },
  },
  {
    id: "an-address-is-added-and-reactivated-from-the-page",
    title: "Add an address puts a typed address on the list with its note, refuses one already listed, Reactivate asks for confirmation before lifting an entry, and See the send opens the send that put an address on the list",
    entryPoint: PAGE,
    async run(ctx) {
      const addresses = await seed(ctx);
      const added = ctx.email("typed");
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto(PAGE);
      const open = async () => {
        for (let attempt = 0; attempt < 10; attempt += 1) {
          await tab.click({ role: "button", name: "Add an address" });
          if ((await tab.visible({ role: "dialog", name: "Add an address to the suppression list" }, { timeoutMs: 1500 })).pass) return;
        }
      };
      await open();
      await tab.fill({ role: "textbox", name: "Address*" }, added);
      await tab.fill({ role: "textbox", name: "Note" }, "typed in the dialog");
      await tab.click({ role: "button", name: "Add to the list" });
      await ctx.verify("the toast confirms and the row appears", [
        tab.shows(/Address added to the suppression list/),
        tab.visible({ role: "row", name: rowOf(added) }),
      ]);
      const entry = entryOf(await suppressionRows(ctx), added);
      await ctx.verify("the entry is stored with its note", [
        check("reason manual", text(entry, "reason") === "manual", entry),
        check("the note is the detail", text(entry, "detail") === "typed in the dialog", entry?.detail),
      ]);
      await open();
      await tab.fill({ role: "textbox", name: "Address*" }, added);
      await tab.click({ role: "button", name: "Add to the list" });
      await ctx.verify("an address already listed is refused in the dialog", [tab.shows(/This address is already on the suppression list\./)]);
      await tab.click({ role: "button", name: "Cancel" });

      await tab.click({ role: "button", name: "Reactivate", within: { role: "row", name: rowOf(added) } });
      await ctx.verify("Reactivate asks first", [
        tab.visible({ role: "dialog", name: `Reactivate ${added}?` }),
        tab.shows(/The next send reaches this address again\. Only do it when the recipient asked for it or the address was fixed\./),
      ]);
      await tab.click({ role: "button", name: "Cancel" });
      await ctx.verify("cancelling lifts nothing", [check("the entry is still listed", entryOf(await suppressionRows(ctx), added) !== undefined, "gone")]);
      await tab.click({ role: "button", name: "Reactivate", within: { role: "row", name: rowOf(added) } });
      await tab.click({ role: "button", name: "Reactivate", exact: true, within: { role: "dialog" } });
      await ctx.verify("confirming lifts the entry", [
        tab.shows(/Address reactivated: the next send reaches it/),
        tab.visible({ role: "row", name: rowOf(added) }, { hidden: true }),
        check("the entry is gone", entryOf(await suppressionRows(ctx), added) === undefined, "listed"),
      ]);

      const hard = entryOf(await suppressionRows(ctx), addresses.hard1);
      await ctx.verify("an entry added by hand offers no row actions menu, so no See the send", [
        tab.visible({ role: "button", name: /^Actions for manual1/ }, { hidden: true, timeoutMs: 3000 }),
        tab.visible({ role: "button", name: /^Actions for hard1/ }),
      ]);
      await tab.click({ role: "button", name: /^Actions for hard1/ });
      await ctx.verify("an entry that came from a send offers See the send", [tab.visible({ role: "menuitem", name: "See the send" })]);
      await tab.click({ role: "menuitem", name: "See the send" });
      await ctx.verify("See the send opens that send in the Sends page", [
        tab.at(/\/modules\/mailing\/sends$/),
        check("the entry names a send", text(hard, "sendId") !== "", hard),
        tab.shows(new RegExp(addresses.hard1.replace(/[+.]/g, "\\$&")), { timeoutMs: 20_000 }),
      ]);
    },
  },
];

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
export const suppressedSends = {
  id: "suppressed-sends-have-their-tab-in-sends-and-leave-the-figures",
  title: "a send to a suppressed address is listed under the Suppressed tab of Sends, in no other tab, and the Sends figures and the Overview leave it out",
  entryPoint: "/modules/mailing/sends, GET /api/mailing/sends/stats",
  async run(ctx) {
    const template = await declareLive(ctx, "figures-order");
    const gone = ctx.email("gone");
    const kept = ctx.email("kept");
    await mailing(ctx, "put an address on the list", "POST", "/suppressions", { body: { email: gone } });
    await sendCode(ctx, "send to the listed address", template.slug, { to: gone });
    await sendCode(ctx, "send to a kept address", template.slug, { to: kept });
    await sendCode(ctx, "send to the listed address again", template.slug, { to: gone });
    const stats = await mailing(ctx, "read the figures", "GET", "/sends/stats");
    await ctx.verify("the figures count the delivered send only", [
      check("one send", pick(stats.body, "sends") === 1, pick(stats.body, "sends")),
      check("no problem", pick(stats.body, "problems") === 0, pick(stats.body, "problems")),
    ]);
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await tab.goto("/modules/mailing/sends");
    const row = (/** @type {string} */ email) => ({ role: "row", name: new RegExp(email.replace(/[+.]/g, "\\$&")) });
    await tab.click({ role: "button", name: /^Suppressed 2$/ });
    await ctx.verify("the Suppressed tab holds the two blocked sends and not the sent one", [
      tab.visible({ role: "row", name: new RegExp(`${gone.replace(/[+.]/g, "\\$&")}.*Suppressed`), nth: 1 }),
      tab.visible(row(kept), { hidden: true, timeoutMs: 4000 }),
    ]);
    await tab.click({ role: "button", name: /^All 3$/ });
    await ctx.verify("the All tab holds all three", [tab.visible(row(kept)), tab.count({ role: "row", name: new RegExp(gone.replace(/[+.]/g, "\\$&")) }, 2)]);
  },
};
