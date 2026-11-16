import { check, mailing, pick } from "../../mailing.mjs";
import { declareLive, importSends } from "./api-kit.mjs";
import { openSettings, saveChanges } from "./settings-page.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */
/** @typedef {import("../../mailing.mjs").Tab} Tab */
/** @typedef {Parameters<Tab["click"]>[0]} Target */

const DAY = 86_400_000;
const WHEN = "(?:tonight|tomorrow|[^·]*?)";

/**
 * @param {string} tail What follows "Next run … at 03:15 · "
 * @returns {RegExp} The pattern of the preview line
 */
const previewLine = (tail) => new RegExp(`Next run ${WHEN} at 03:15 · ${tail}`);

/**
 * Clicks a target again until the save bar shows that the form took the change (the page hydrates after load).
 *
 * @param {Tab} tab The tab
 * @param {Target} target What to click
 */
async function clickUntilChanged(tab, target) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await tab.click(target);
    if ((await tab.visible({ role: "button", name: "Save changes" }, { timeoutMs: 1500 })).pass) return;
  }
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} */
export const morePageJourneys = [
  {
    id: "the-retention-control-previews-the-next-run-and-confirms-a-deletion",
    title: "Keep sends for offers 30 days, 90 days, 1 year and a custom duration, shows when the next run happens and how many sends it will delete, and asks for confirmation (Save and delete) only when a shorter duration deletes sends",
    entryPoint: "/modules/mailing/settings",
    async run(ctx) {
      const template = await declareLive(ctx, "page-retention-order");
      await importSends(ctx, "import a send of 100 and a send of 400 days ago", [100, 400].map((age) => ({ importId: `ret-${age}`, templateSlug: template.slug, to: { email: ctx.email(`ret${age}`) }, sentAt: { $date: new Date(Date.now() - age * DAY).toISOString() } })));
      const tab = await openSettings(ctx);
      const stored = async () => pick((await mailing(ctx, "read the settings", "GET", "/settings")).body, "logRetentionDays");
      await ctx.verify("the four choices, 90 days checked, and the preview for the stored duration", [
        ...["30 days", "90 days", "1 year", "Custom"].map((name) => tab.visible({ role: "radio", name })),
        check("90 days is the checked choice", await tab.locator({ role: "radio", name: "90 days" }).isChecked(), "unchecked"),
        tab.shows(previewLine("2 sends older than 90 days will be deleted\\.")),
      ]);
      await clickUntilChanged(tab, { role: "radio", name: "1 year" });
      await ctx.verify("1 year previews its own count", [tab.shows(previewLine("1 send older than 365 days will be deleted\\."))]);
      await saveChanges(tab);
      await ctx.verify("a longer duration saves without a question", [tab.shows(/Settings saved/), check("365 days stored", (await stored()) === 365, await stored())]);
      await clickUntilChanged(tab, { role: "radio", name: "30 days" });
      await ctx.verify("30 days previews the two old sends", [tab.shows(previewLine("2 sends older than 30 days will be deleted\\."))]);
      await saveChanges(tab);
      await ctx.verify("a shorter duration that deletes sends asks first", [
        tab.visible({ role: "dialog", name: "Delete old sends?" }),
        tab.shows(/2 sends older than 30 days will be deleted .* They can no longer be sent again\./),
      ]);
      await tab.click({ role: "button", name: "Cancel" });
      await ctx.verify("cancelling saves nothing", [check("still 365 days", (await stored()) === 365, await stored())]);
      await saveChanges(tab);
      await tab.click({ role: "button", name: "Save and delete" });
      await ctx.verify("Save and delete stores the duration", [tab.shows(/Settings saved/), check("30 days stored", (await stored()) === 30, await stored())]);
      await tab.click({ role: "radio", name: "Custom" });
      await tab.fill({ role: "spinbutton" }, "1000");
      await tab.press("Tab", { role: "spinbutton" });
      await ctx.verify("a custom duration previews itself, with no old send", [tab.shows(previewLine("no send is older than 1000 days yet\\.")), tab.visible({ role: "button", name: "Save changes" })]);
      await saveChanges(tab);
      await ctx.verify("a longer custom duration saves without a question", [tab.shows(/Settings saved/), check("1000 days stored", (await stored()) === 1000, await stored())]);
      await tab.fill({ role: "spinbutton" }, "500");
      await tab.press("Tab", { role: "spinbutton" });
      await saveChanges(tab);
      await ctx.verify("a shorter duration that deletes nothing saves without a question", [tab.shows(/Settings saved/), check("500 days stored", (await stored()) === 500, await stored())]);
    },
  },
];
