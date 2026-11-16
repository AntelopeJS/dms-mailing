import { member } from "../../mailing.mjs";
import { declareLive, importSends, postEvent, secretOf, sendCode } from "./api-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const PAGES = ["overview", "templates", "sends", "settings", "suppressions"];

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} */
export const uiAccessJourneys = [
  {
    id: "the-mailing-pages-are-the-owners-only",
    title: "the owner sees Mailing in the navigation and opens its five pages; a member whose role grants every mailing permission does not see the module and is not let into any of its pages",
    entryPoint: "/modules/mailing/*",
    async run(ctx) {
      await member(ctx, "everything", ["mailing.send", "modules.mailing.configure.settings", "modules.mailing.configure.suppressions", "modules.mailing.main.sends", "modules.mailing.main.templates"]);
      const owner = await ctx.tab("admin", "owner");
      await owner.signIn("admin");
      for (const page of PAGES) {
        await owner.goto(`/modules/mailing/${page}`);
        await ctx.verify(`the owner opens ${page}`, [owner.at(new RegExp(`/modules/mailing/${page}$`)), owner.visible({ role: "heading", name: /^(Overview|Templates|Sends|Settings|Suppression list)$/, exact: false })]);
      }
      const guest = await ctx.tab("everything", "member");
      await guest.signIn("everything");
      for (const page of PAGES) {
        await guest.goto(`/modules/mailing/${page}`);
        await guest.snapshot(`the member on ${page}`);
        await ctx.verify(`a member is not let into ${page}`, [guest.at(/^(?!\/modules\/mailing)/)]);
      }
      await ctx.verify("the member's navigation holds no Mailing", [
        guest.visible({ role: "link", name: /^(Overview|Sends|Suppression list)$/ }, { hidden: true, timeoutMs: 4000 }),
        guest.visible({ role: "link", name: /mailing/i }, { hidden: true, timeoutMs: 4000 }),
      ]);
    },
  },
  {
    id: "new-sends-and-events-appear-on-an-open-sends-page-without-a-reload",
    title: "a second tab on the Sends page shows a new send as soon as SendTemplate logs it and a webhook event on it updates its status, with no reload (the mailing:sends realtime topic)",
    entryPoint: "mailing:sends realtime topic, /modules/mailing/sends",
    async run(ctx) {
      const template = await declareLive(ctx, "realtime-order", { variables: [] });
      await importSends(ctx, "import an earlier send", [{ importId: "early", templateSlug: template.slug, to: { email: ctx.email("early") }, sentAt: { $date: new Date(Date.now() - 120_000).toISOString() }, providerMessageId: "early-1" }]);
      const secret = await secretOf(ctx);
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto("/modules/mailing/sends");
      const to = ctx.email("live");
      await ctx.verify("the page is up before anything happens", [tab.visible({ role: "button", name: /^All 1$/ }), tab.visible({ role: "button", name: "Live", exact: true }), tab.shows(/Problems\s+0\s+vs\s+0/i)]);
      await new Promise((resolve) => setTimeout(resolve, 4000));
      await sendCode(ctx, "send while the page is open", template.slug, { to, variables: {} });
      await ctx.verify("the open page announces the new send without a reload", [tab.shows(/1 new send/, { timeoutMs: 20_000 })]);
      await tab.click({ role: "button", name: "Show" });
      await ctx.verify("Show lists it, and the tabs count it", [tab.shows(/live\+/), tab.visible({ role: "button", name: /^All 2$/ }, { timeoutMs: 20_000 })]);
      await postEvent(ctx, "a hard bounce arrives on the earlier send", { secret, body: { messageId: "early-1", type: "bounced", details: { bounceType: "hard", reason: "550 gone" } } });
      await ctx.verify("the event reaches the open page: the figures count a problem", [tab.shows(/Problems\s+1\s+vs\s+0\s+·\s+1 bounce/i, { timeoutMs: 20_000 })]);
    },
  },
];
