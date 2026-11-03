import { guarded } from "../guard.mjs";
import { check, list, mailing, pick, text } from "../mailing.mjs";

/** @typedef {import("../mailing.mjs").Ctx} Ctx */

/** The introduction's "A first test send", through the API and the Sends page. */
export const journeys = guarded([
  {
    id: "smoke",
    title: "an owner creates a template from a starter, sends a test, and reads it in Sends and in the mail sink",
    entryPoint: "/modules/mailing/templates, POST /api/mailing/templates/:id/test-send, /modules/mailing/sends",
    async run(/** @type {Ctx} */ ctx) {
      const starters = await mailing(ctx, "list the starters", "GET", "/templates/starters");
      const starter = list(starters.body, "starters").find((entry) => text(entry, "slug") === "order-confirmation") ?? list(starters.body, "starters")[0];
      await ctx.verify("the module offers starters", [check("at least one starter", starter !== undefined, starters.body)], { critical: true });
      const created = await ctx.api("create a template from the starter", {
        method: "POST",
        path: "/api/mailing/tables/templates/new",
        body: { slug: "smoke-order", name: "Smoke order", category: text(starter, "category"), starterId: text(starter, "id") },
      });
      const id = text(created.body, "_id") || text(created.body, "id") || text(pick(created.body, "row"), "_id");
      await ctx.verify("the template is created as a draft", [check("the table answers its row", created.status === 200 && id !== "", created.body)], { critical: true });
      const recipient = ctx.email("sofie");
      const sent = await mailing(ctx, "send a test", "POST", `/templates/${id}/test-send`, { body: { to: [recipient] } });
      await ctx.verify("the test send is accepted", [check("HTTP 200", sent.status === 200, sent.body)], { critical: true });
      const arrived = await ctx.mail((message) => message.to.some((address) => address.includes(recipient)));
      await ctx.verify("the mail sink received it", [
        check("one message to the recipient", arrived.match !== undefined, arrived.messages.map((message) => message.to)),
        check("its subject starts with [TEST]", arrived.match?.subject.startsWith("[TEST]") === true, arrived.match?.subject),
      ]);
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto("/modules/mailing/sends");
      await ctx.verify("the Sends page lists the test send", [tab.shows(new RegExp(recipient.replace(/[+.]/g, "\\$&")), { timeoutMs: 30_000 })]);
    },
  },
]);
