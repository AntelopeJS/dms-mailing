import { calling, check, mailing, pick, text } from "../../mailing.mjs";
import { content, created, live, refused, save, table } from "./templates-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

/**
 * @param {Ctx} ctx The journey
 * @param {string} id The template
 * @param {string} action publish, unpublish, archive, restore or discard
 * @returns {Promise<import("../../mailing.mjs").Answer>} The answer
 */
function move(ctx, id, action) {
  return mailing(ctx, action, "POST", `/templates/${id}/${action}`, { body: {} });
}

export const journeys = [
  {
    id: "lifecycle-moves-follow-the-status",
    title: "a draft publishes or archives, a live template unpublishes or archives, an archived one restores as a draft, and every other move is a 409",
    entryPoint: "POST /api/mailing/templates/:id/{publish,unpublish,archive,restore,discard}",
    async run(/** @type {Ctx} */ ctx) {
      const { id } = await created(ctx, { slug: "moves", name: "Moves", category: "orders" });
      const statusOf = async () => text((await table(ctx, "read the status", "GET", `/get?id=${id}`)).body, "status");
      const nothing = await move(ctx, id, "publish");
      await ctx.verify("a blank draft has an empty English subject and cannot publish", [
        check("a new template is a draft", (await statusOf()) === "draft", "status"),
        refused(nothing, 422, "empty_subject"),
      ]);
      await save(ctx, id, { content: content("") });
      const empty = await move(ctx, id, "publish");
      await ctx.verify("a locale with an empty subject stops the publish", [refused(empty, 422, "empty_subject")]);
      await save(ctx, id, { content: content("First") });
      await ctx.verify("a draft refuses unpublish and restore", [
        refused(await move(ctx, id, "unpublish"), 409, "invalid_transition"),
        refused(await move(ctx, id, "restore"), 409, "invalid_transition"),
      ]);
      const published = await move(ctx, id, "publish");
      await ctx.verify("publishing makes the template live at version 1", [
        check("200 and live", published.status === 200 && text(published.body, "status") === "live", published.body),
        check("stored as live", (await statusOf()) === "live", "status"),
        check("version 1", pick(published.body, "version") === 1 || pick(published.body, "publishedVersion") === 1, published.body),
      ]);
      await ctx.verify("a live template refuses restore", [refused(await move(ctx, id, "restore"), 409, "invalid_transition")]);
      await save(ctx, id, { content: content("Second") });
      const second = await move(ctx, id, "publish");
      await ctx.verify("publishing again with a draft change is version 2", [check("version 2", pick(second.body, "version") === 2 || pick(second.body, "publishedVersion") === 2, second.body)]);
      const unpublished = await move(ctx, id, "unpublish");
      await ctx.verify("unpublish brings a live template back as a draft", [
        check("200", unpublished.status === 200 && text(unpublished.body, "status") === "draft", unpublished.body),
        check("stored as draft", (await statusOf()) === "draft", "status"),
      ]);
      const archived = await move(ctx, id, "archive");
      await ctx.verify("a draft archives; an archived template refuses archive, publish and unpublish", [
        check("archived", archived.status === 200 && (await statusOf()) === "archived", archived.body),
        refused(await move(ctx, id, "archive"), 409, "invalid_transition"),
        refused(await move(ctx, id, "publish"), 409, "invalid_transition"),
        refused(await move(ctx, id, "unpublish"), 409, "invalid_transition"),
      ]);
      const restored = await move(ctx, id, "restore");
      await ctx.verify("restore brings an archived template back as a draft", [check("draft", restored.status === 200 && (await statusOf()) === "draft", restored.body)]);
      const liveId = await live(ctx, "moves-live");
      const liveArchived = await move(ctx, liveId, "archive");
      await ctx.verify("a live template archives", [check("archived", liveArchived.status === 200 && text((await table(ctx, "read", "GET", `/get?id=${liveId}`)).body, "status") === "archived", liveArchived.body)]);
    },
  },
  {
    id: "an-unpublished-or-archived-template-refuses-sends",
    title: "code that calls the slug of a draft, unpublished or archived template gets an error and nothing reaches the provider",
    entryPoint: "SendTemplate through the fixture, POST /api/mailing/templates/:id/unpublish",
    async run(/** @type {Ctx} */ ctx) {
      const id = await live(ctx, "gated-send");
      const to = ctx.email("gated");
      const send = () => calling(ctx, "send", "send", ["gated-send", { tenantId: "default", to: { email: to }, variables: {} }]);
      const ok = await send();
      await ctx.verify("a live template sends", [check("status sent", pick(ok.result, "status") === "sent", ok.result ?? ok.error)]);
      await move(ctx, id, "unpublish");
      const draft = await send();
      await move(ctx, id, "archive");
      const archived = await send();
      const draftRejected = !draft.ok || pick(draft.result, "status") === "failed";
      const archivedRejected = !archived.ok || pick(archived.result, "status") === "failed";
      const mails = await ctx.mail((message) => message.to.some((address) => address.includes(to)), 3000);
      await ctx.verify("a template out of use refuses the send", [
        check("unpublished is refused", draftRejected, draft.result ?? draft.error),
        check("archived is refused", archivedRejected, archived.result ?? archived.error),
        check("only the first send reached the sink", mails.messages.filter((message) => message.to.some((address) => address.includes(to))).length === 1, mails.messages.length),
      ]);
    },
  },
  {
    id: "delete-takes-only-an-archived-template-never-sent",
    title: "only an archived template that was never sent can be deleted; its versions go with it and its slug is free again",
    entryPoint: "DELETE /api/mailing/tables/templates/delete",
    async run(/** @type {Ctx} */ ctx) {
      const liveId = await live(ctx, "del-live");
      const liveDelete = await table(ctx, "delete a live template", "DELETE", `/delete?id=${liveId}`);
      const draft = await created(ctx, { slug: "del-draft", name: "Draft" });
      const draftDelete = await table(ctx, "delete a draft", "DELETE", `/delete?id=${draft.id}`);
      await move(ctx, liveId, "archive");
      await mailing(ctx, "send it once", "POST", `/templates/${liveId}/test-send`, { body: { to: [ctx.email("del")] } });
      await calling(ctx, "send", "send", ["del-live", { tenantId: "default", to: { email: ctx.email("del2") } }]);
      const sentDelete = await table(ctx, "delete an archived template that was sent", "DELETE", `/delete?id=${liveId}`);
      await ctx.verify("a live and a draft template are refused", [refused(liveDelete, 409, "template_in_use"), check("a draft is refused", draftDelete.status === 409, draftDelete.body)]);
      await ctx.verify("an archived template that was sent is refused", [check("409 template_was_sent or in_use", sentDelete.status === 409, sentDelete.body)]);
      const free = await live(ctx, "del-free");
      await move(ctx, free, "archive");
      const versionsBefore = await mailing(ctx, "versions before", "GET", `/templates/${free}/versions`);
      const removed = await table(ctx, "delete an archived template never sent", "DELETE", `/delete?id=${free}`);
      const gone = await table(ctx, "read it", "GET", `/get?id=${free}`);
      const reused = await created(ctx, { slug: "del-free", name: "Reused" });
      await ctx.verify("an archived template never sent is deleted and frees its slug", [
        check("it had a version", versionsBefore.status === 200 && JSON.stringify(versionsBefore.body).length > 5, versionsBefore.body),
        check("deleted", removed.status === 200, removed.body),
        check("gone", gone.status === 404 || text(gone.body, "slug") === "", gone.body),
        check("the slug is free again", reused.answer.status === 200, reused.answer.body),
      ]);
    },
  },
];
