import { calling, check, list, mailing, pick } from "../../mailing.mjs";
import { content, created, refused, save } from "./templates-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

/**
 * @param {Ctx} ctx The journey
 * @param {string} id The template
 * @returns {Promise<import("../../mailing.mjs").Answer>} The editor's read
 */
function read(ctx, id) {
  return mailing(ctx, "read the editor's content", "GET", `/templates/${id}/content`);
}

export const journeys = [
  {
    id: "edits-stay-in-a-draft-until-published",
    title: "an edit saves a draft, real sends keep using the published version, discard goes back to it, and putting the content back as published drops the draft",
    entryPoint: "POST /api/mailing/templates/:id/{content,publish,discard}, SendTemplate",
    async run(/** @type {Ctx} */ ctx) {
      const { id } = await created(ctx, { slug: "draft-flow", name: "Draft flow", category: "orders" });
      await save(ctx, id, { content: content("Published subject") });
      await mailing(ctx, "publish", "POST", `/templates/${id}/publish`, { body: {} });
      const saved = await save(ctx, id, { content: content("Draft subject") });
      const open = await read(ctx, id);
      await ctx.verify("a save writes a draft next to the published content", [
        check("saved", pick(saved.body, "saved") === true, saved.body),
        check("hasDraft", pick(open.body, "hasDraft") === true, open.body),
        check("the editor shows the draft", pick(open.body, "content", "locales", "en", "subject") === "Draft subject", open.body),
        check("customers keep the published content", pick(open.body, "publishedContent", "locales", "en", "subject") === "Published subject", open.body),
        check("one pending change", list(open.body, "changes").length >= 1, pick(open.body, "changes")),
      ]);
      const to = ctx.email("draft");
      const sent = await calling(ctx, "send", "send", ["draft-flow", { tenantId: "default", to: { email: to } }]);
      const mail = await ctx.mail((message) => message.to.some((address) => address.includes(to)));
      await ctx.verify("a real send uses the published version", [
        check("sent", pick(sent.result, "status") === "sent", sent.result ?? sent.error),
        check("subject Published subject", mail.match?.subject === "Published subject", mail.match?.subject),
      ]);
      const discarded = await mailing(ctx, "discard", "POST", `/templates/${id}/discard`, { body: {} });
      const afterDiscard = await read(ctx, id);
      await ctx.verify("discard goes back to the published version", [
        check("200", discarded.status === 200, discarded.body),
        check("no draft", pick(afterDiscard.body, "hasDraft") === false, afterDiscard.body),
        check("published subject", pick(afterDiscard.body, "content", "locales", "en", "subject") === "Published subject", afterDiscard.body),
      ]);
      await save(ctx, id, { content: content("Other") });
      const back = await save(ctx, id, { content: content("Published subject") });
      const afterBack = await read(ctx, id);
      await ctx.verify("content put back as published leaves no draft", [
        check("no change listed", JSON.stringify(pick(back.body, "changes")) === "[]", back.body),
        check("hasDraft false", pick(afterBack.body, "hasDraft") === false, afterBack.body),
      ]);
      const again = await mailing(ctx, "publish without a change", "POST", `/templates/${id}/publish`, { body: {} });
      const versions = await mailing(ctx, "list the versions", "GET", `/templates/${id}/versions`);
      await ctx.verify("publishing without a change writes no version", [
        check("still version 1", pick(again.body, "version") === 1, again.body),
        check("one version", list(versions.body, "versions").length === 1, versions.body),
      ]);
      const fresh = await created(ctx, { slug: "never-published", name: "Never", category: "orders" });
      const refusedDiscard = await mailing(ctx, "discard a template never published", "POST", `/templates/${fresh.id}/discard`, { body: {} });
      await ctx.verify("a template never published has nothing to discard", [refused(refusedDiscard, 409, "nothing_to_discard")]);
    },
  },
  {
    id: "a-stale-editor-cannot-overwrite-a-newer-draft",
    title: "a save, a publish or a restore that carries an older revision than the stored draft is refused with 409 draft_conflict",
    entryPoint: "POST /api/mailing/templates/:id/{content,publish,versions/:n/restore}",
    async run(/** @type {Ctx} */ ctx) {
      const { id } = await created(ctx, { slug: "conflict", name: "Conflict", category: "orders" });
      const opened = Number(pick((await read(ctx, id)).body, "revision"));
      const first = await save(ctx, id, { content: content("Tab A"), revision: opened });
      const stale = await save(ctx, id, { content: content("Tab B"), revision: opened });
      const stalePublish = await mailing(ctx, "publish behind the draft", "POST", `/templates/${id}/publish`, { body: { revision: opened } });
      const after = await read(ctx, id);
      await ctx.verify("a stale writer is refused and the newer draft stays", [
        check("the first save moves the revision up by one", pick(first.body, "revision") === opened + 1, first.body),
        refused(stale, 409, "draft_conflict"),
        refused(stalePublish, 409, "draft_conflict"),
        check("the stored draft is Tab A", pick(after.body, "content", "locales", "en", "subject") === "Tab A", after.body),
        check("the revision is the first save's", pick(after.body, "revision") === pick(first.body, "revision"), after.body),
      ]);
      const published = await mailing(ctx, "publish with the current revision", "POST", `/templates/${id}/publish`, { body: { revision: Number(pick(first.body, "revision")) } });
      await ctx.verify("the current revision publishes", [check("200", published.status === 200, published.body)]);
      const saved = await save(ctx, id, { content: content("Tab C") });
      const restoreStale = await mailing(ctx, "restore behind the draft", "POST", `/templates/${id}/versions/1/restore`, { body: { revision: opened } });
      const restoreMissing = await mailing(ctx, "restore an unknown version", "POST", `/templates/${id}/versions/9/restore`, { body: {} });
      await ctx.verify("restore refuses a stale revision and an unknown version", [
        check("saved", saved.status === 200, saved.body),
        refused(restoreStale, 409, "draft_conflict"),
        check("an unknown version is a 404", restoreMissing.status === 404, restoreMissing.body),
      ]);
    },
  },
  {
    id: "a-version-restores-as-a-draft-and-customers-stay-on-the-live-one",
    title: "the history lists the published versions, restoring one writes it as the draft with its variables, and restoring the live version leaves no draft",
    entryPoint: "GET /api/mailing/templates/:id/versions, POST /api/mailing/templates/:id/versions/:n/restore",
    async run(/** @type {Ctx} */ ctx) {
      const { id } = await created(ctx, { slug: "history", name: "History", category: "orders" });
      const order = { path: "order.id", type: "string", required: true };
      await save(ctx, id, { content: content("First"), variables: [order] });
      await mailing(ctx, "publish v1", "POST", `/templates/${id}/publish`, { body: {} });
      await save(ctx, id, { content: content("Second"), variables: [] });
      await mailing(ctx, "publish v2", "POST", `/templates/${id}/publish`, { body: {} });
      const history = await mailing(ctx, "list the versions", "GET", `/templates/${id}/versions`);
      const versions = list(history.body, "versions");
      await ctx.verify("two published versions", [
        check("two versions", versions.length === 2, history.body),
        check("version 1 declares order.id", JSON.stringify(pick(versions.find((entry) => pick(entry, "version") === 1), "variables")) === JSON.stringify([order]), versions),
        check("version 2 declares nothing", JSON.stringify(pick(versions.find((entry) => pick(entry, "version") === 2), "variables")) === "[]", versions),
      ]);
      const restored = await mailing(ctx, "restore v1", "POST", `/templates/${id}/versions/1/restore`, { body: {} });
      const after = await read(ctx, id);
      await ctx.verify("version 1 comes back as the draft; customers stay on version 2", [
        check("200", restored.status === 200, restored.body),
        check("a draft", pick(after.body, "hasDraft") === true, after.body),
        check("draft subject First", pick(after.body, "content", "locales", "en", "subject") === "First", after.body),
        check("draft variables", JSON.stringify(pick(after.body, "variables")) === JSON.stringify([order]), after.body),
        check("published subject Second", pick(after.body, "publishedContent", "locales", "en", "subject") === "Second", after.body),
        check("published variables stay empty", JSON.stringify(pick(after.body, "publishedVariables")) === "[]", after.body),
      ]);
      const to = ctx.email("hist");
      await calling(ctx, "send", "send", ["history", { tenantId: "default", to: { email: to } }]);
      const mail = await ctx.mail((message) => message.to.some((address) => address.includes(to)));
      const v3 = await mailing(ctx, "publish the restored draft", "POST", `/templates/${id}/publish`, { body: {} });
      await ctx.verify("a send meanwhile uses version 2, and publishing the restore makes version 3", [
        check("subject Second", mail.match?.subject === "Second", mail.match?.subject),
        check("version 3", pick(v3.body, "version") === 3, v3.body),
      ]);
      await save(ctx, id, { content: content("Pending") });
      await mailing(ctx, "restore the live version", "POST", `/templates/${id}/versions/3/restore`, { body: {} });
      const live = await read(ctx, id);
      await ctx.verify("restoring the live version leaves no draft", [check("no draft", pick(live.body, "hasDraft") === false && JSON.stringify(pick(live.body, "changes")) === "[]", live.body)]);
      const unknown = await mailing(ctx, "restore version zero", "POST", `/templates/${id}/versions/0/restore`, { body: {} });
      await ctx.verify("version zero does not exist", [check("404", unknown.status === 404, unknown.body)]);
    },
  },
];
