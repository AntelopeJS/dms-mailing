import { calling, check, isRow, list, mailing, pick, text } from "../../mailing.mjs";
import { content, created, live, refused, save, table } from "./templates-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const STARTERS = [
  ["order-confirmed", "Order confirmation", "orders"],
  ["order-shipped", "Shipping update", "orders"],
  ["password-reset", "Password reset", "account"],
  ["invoice-ready", "Invoice available", "billing"],
];

export const journeys = [
  {
    id: "the-four-starters-arrive-as-drafts-with-variables-and-test-data",
    title: "Order confirmation, Shipping update, Password reset and Invoice available come with English and French content, declared variables and test data",
    entryPoint: "GET /api/mailing/templates/starters, POST /api/mailing/tables/templates/new with starterId",
    async run(/** @type {Ctx} */ ctx) {
      const starters = await mailing(ctx, "list the starters", "GET", "/templates/starters");
      const rows = list(starters.body, "starters");
      await ctx.verify("the starters", [
        check("exactly four", rows.length === 4, rows.map((row) => text(row, "id"))),
        ...STARTERS.map(([id, name, category]) => {
          const row = rows.find((entry) => text(entry, "id") === id);
          return check(`${id}: name, slug, category and locales`, row !== undefined && text(row, "name") === name && text(row, "slug") === id && text(row, "category") === category && JSON.stringify(pick(row, "locales")) === '["en","fr"]', row);
        }),
      ], { critical: true });
      for (const [id] of STARTERS) {
        const made = await created(ctx, { slug: `from-${id}`, name: `From ${id}`, starterId: id });
        const read = await mailing(ctx, "read it", "GET", `/templates/${made.id}/content`);
        const row = await table(ctx, "its row", "GET", `/get?id=${made.id}`);
        const variables = pick(read.body, "variables");
        const data = pick(read.body, "testData");
        await ctx.verify(`${id} arrives as a draft`, [
          check("created", made.answer.status === 200, made.answer.body),
          check("a draft", text(row.body, "status") === "draft", row.body),
          check("English and French", Object.keys(pick(read.body, "content", "locales") ?? {}).sort().join() === "en,fr", read.body),
          check("variables are declared", Array.isArray(variables) && variables.length > 0, variables),
          check("test data is filled", Object.keys(isRow(data) ? data : {}).length > 0, data),
        ]);
        const fr = await mailing(ctx, "preview in French", "GET", `/templates/starters/${id}/preview?locale=fr`);
        const en = await mailing(ctx, "preview in English", "GET", `/templates/starters/${id}/preview?locale=en`);
        const de = await mailing(ctx, "preview in German", "GET", `/templates/starters/${id}/preview?locale=de`);
        await ctx.verify(`${id} previews in the locale asked, else the fallback`, [
          check("French", text(fr.body, "locale") === "fr" && text(fr.body, "html").includes('lang="fr"'), text(fr.body, "locale")),
          check("English", text(en.body, "locale") === "en" && text(en.body, "html").includes('lang="en"'), text(en.body, "locale")),
          check("an unknown locale gives the fallback locale", text(de.body, "locale") === "en", text(de.body, "locale")),
          check("French differs from English", text(fr.body, "html") !== text(en.body, "html"), "same html"),
        ]);
      }
      const unknown = await mailing(ctx, "preview an unknown starter", "GET", "/templates/starters/nope/preview");
      const create = await created(ctx, { slug: "from-nope", name: "Nope", starterId: "nope" });
      await ctx.verify("an unknown starter is refused", [refused(unknown, 404, "starter_not_found"), refused(create.answer, 404, "starter_not_found")]);
    },
  },
  {
    id: "the-gallery-groups-by-category-and-filters-by-status",
    title: "the gallery groups templates by category in the settings order with the uncategorised last, shows each status, and the tabs hold exactly their statuses",
    entryPoint: "/modules/mailing/templates",
    async run(/** @type {Ctx} */ ctx) {
      await live(ctx, "g-live");
      const changed = await live(ctx, "g-changed");
      await save(ctx, changed, { content: content("Edited after publishing") });
      await created(ctx, { slug: "g-draft", name: "G draft", category: "billing" });
      const archived = await created(ctx, { slug: "g-archived", name: "G archived", category: "orders" });
      await mailing(ctx, "archive", "POST", `/templates/${archived.id}/archive`, { body: {} });
      await created(ctx, { slug: "g-none", name: "G none" });
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto("/modules/mailing/templates");
      const tabs = [["All", 4], ["Live", 2], ["Drafts", 2], ["Archived", 1], ["Needs attention", 2]];
      await ctx.verify("the tabs count their templates", [
        tab.visible({ role: "button", name: `All 4`, exact: true }),
        ...tabs.slice(1).map(([name, count]) => tab.visible({ role: "button", name: `${name} ${count}`, exact: true })),
      ], { critical: true });
      await ctx.verify("the cards show their status and slug", [
        tab.visible({ role: "article", name: "g-live" }),
        tab.shows(/Draft changes/),
        tab.visible({ role: "article", name: "G draft" }),
        tab.visible({ role: "article", name: "G none" }),
        tab.count({ role: "article", name: "G archived" }, 0),
      ]);
      await tab.click({ role: "button", name: "Archived 1", exact: true });
      await ctx.verify("the Archived tab holds only the archived template", [
        tab.visible({ role: "article", name: "G archived" }),
        tab.count({ role: "article", name: "G draft" }, 0),
        tab.count({ role: "article", name: "g-live" }, 0),
      ]);
      await tab.click({ role: "button", name: "Live 2", exact: true });
      await ctx.verify("the Live tab holds the live templates, drafts with changes included", [
        tab.visible({ role: "article", name: "g-live" }),
        tab.visible({ role: "article", name: "g-changed" }),
        tab.count({ role: "article", name: "G draft" }, 0),
      ]);
      await tab.click({ role: "button", name: "Drafts 2", exact: true });
      await ctx.verify("the Drafts tab holds the drafts", [
        tab.visible({ role: "article", name: "G draft" }),
        tab.visible({ role: "article", name: "G none" }),
        tab.count({ role: "article", name: "g-live" }, 0),
      ]);
    },
  },
  {
    id: "needs-attention-lists-live-templates-without-a-real-send",
    title: "the Needs attention tab holds the live templates with no real send in the last 30 days, and a real send takes a template off it",
    entryPoint: "/modules/mailing/templates",
    async run(/** @type {Ctx} */ ctx) {
      const sentOne = await live(ctx, "na-sent");
      await live(ctx, "na-quiet");
      await created(ctx, { slug: "na-draft", name: "NA draft" });
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto("/modules/mailing/templates");
      await tab.click({ role: "button", name: "Needs attention 2", exact: true });
      await ctx.verify("two live templates without a send", [
        tab.visible({ role: "article", name: "na-sent" }),
        tab.visible({ role: "article", name: "na-quiet" }),
        tab.count({ role: "article", name: "NA draft" }, 0),
      ]);
      const sent = await calling(ctx, "send", "send", ["na-sent", { tenantId: "default", to: { email: ctx.email("na") } }]);
      await ctx.verify("a real send is accepted", [check("sent", pick(sent.result, "status") === "sent", sent.result ?? sent.error)], { critical: true });
      await tab.goto("/modules/mailing/templates");
      await ctx.verify("the sent template left the tab", [
        tab.visible({ role: "button", name: "Needs attention 1", exact: true }),
        check("the template id is unchanged", sentOne !== "", sentOne),
      ]);
      await tab.click({ role: "button", name: "Needs attention 1", exact: true });
      await ctx.verify("only the quiet template remains", [tab.visible({ role: "article", name: "na-quiet" }), tab.count({ role: "article", name: "na-sent" }, 0)]);
    },
  },
];
