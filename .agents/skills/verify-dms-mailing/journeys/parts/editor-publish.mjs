import { calling, check, list, mailing, pick, text } from "../../mailing.mjs";
import { wait } from "./browser-kit.mjs";
import { content, created, save, table } from "./templates-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */
/** @typedef {import("../../mailing.mjs").Tab} Tab */

const SLUG = "keyboard-publish";
const NAME = "Keyboard publish";
const POLLS = 6;
const REVIEW_ATTEMPTS = 15;
const REVIEW_WAIT_MS = 2000;

/**
 * What the server states about the template: its status, its published versions and its published subject.
 *
 * @param {Ctx} ctx The journey
 * @param {string} id The template
 * @param {string} label What the read is for
 * @returns {Promise<{ status: string, versions: number[], published: unknown, hasDraft: unknown }>} The state
 */
async function stateOf(ctx, id, label) {
  const row = await table(ctx, `read the template ${label}`, "GET", `/get?id=${id}`);
  const versions = await mailing(ctx, `list the versions ${label}`, "GET", `/templates/${id}/versions`);
  const editor = await mailing(ctx, `read the editor's content ${label}`, "GET", `/templates/${id}/content`);
  return {
    status: text(row.body, "status"),
    versions: list(versions.body, "versions").map((entry) => Number(pick(entry, "version"))),
    published: pick(editor.body, "publishedContent", "locales", "en", "subject"),
    hasDraft: pick(editor.body, "hasDraft"),
  };
}

/**
 * Presses Ctrl+Enter until the review shows: the page renders on the server and hydrates after `load`, and a
 * keystroke before that does nothing.
 *
 * @param {Tab} tab The editor tab
 * @param {number} version The version the review offers
 * @returns {Promise<void>}
 */
async function openReview(tab, version) {
  for (let attempt = 0; attempt < REVIEW_ATTEMPTS; attempt += 1) {
    await tab.press("Control+Enter");
    const shown = await tab.visible({ role: "button", name: `Publish v${version}` }, { timeoutMs: REVIEW_WAIT_MS });
    if (shown.pass) return;
  }
}

/**
 * Opens the review with Ctrl+Enter and clicks its publish button, then waits for the server to show the version.
 *
 * @param {Ctx} ctx The journey
 * @param {Tab} tab The editor tab
 * @param {string} id The template
 * @param {number} version The version the review offers and the publish must create
 * @returns {Promise<void>}
 */
async function publishFromReview(ctx, tab, id, version) {
  await openReview(tab, version);
  await tab.click({ role: "button", name: `Publish v${version}` });
  await tab.visible({ role: "dialog" }, { hidden: true });
  for (let attempt = 0; attempt < POLLS; attempt += 1) {
    const { versions } = await stateOf(ctx, id, `after the publish of v${version}`);
    if (versions.includes(version)) return;
    await wait(tab, 1000);
  }
}

export const journeys = [
  {
    id: "ctrl-enter-opens-the-publish-review-and-publishing-from-it-goes-live",
    title: "Ctrl+Enter opens the publish review without publishing, Keep editing leaves the template a draft with no version, Publish v1 makes it live with version 1 and customers receive that subject, and a later change publishes as v2 the same way",
    entryPoint: "/modules/mailing/templates/<id>, Ctrl+Enter, POST /api/mailing/templates/:id/publish",
    async run(/** @type {Ctx} */ ctx) {
      const { id } = await created(ctx, { slug: SLUG, name: NAME, category: "orders" });
      await save(ctx, id, { content: content("Subject one") });
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto(`/modules/mailing/templates/${id}`);
      await tab.visible({ role: "button", name: "Publish changes" });
      await openReview(tab, 1);
      const opened = await stateOf(ctx, id, "with the review open");
      await ctx.verify("Ctrl+Enter opens the review and publishes nothing", [
        tab.visible({ role: "dialog", name: `Publish ${NAME}?` }),
        tab.visible({ role: "button", name: "Publish v1" }),
        check("still a draft with no version", opened.status === "draft" && opened.versions.length === 0 && opened.published === undefined, opened),
      ]);
      await tab.click({ role: "button", name: "Keep editing" });
      await tab.visible({ role: "dialog" }, { hidden: true });
      const kept = await stateOf(ctx, id, "after Keep editing");
      await ctx.verify("Keep editing closes the review and publishes nothing", [check("still a draft with no version", kept.status === "draft" && kept.versions.length === 0, kept)]);

      await publishFromReview(ctx, tab, id, 1);
      const first = await stateOf(ctx, id, "after the first publish");
      const to = ctx.email("kbd-one");
      const sentOne = await calling(ctx, "send the live template", "send", [SLUG, { tenantId: "default", to: { email: to } }]);
      const mailOne = await ctx.mail((message) => message.to.some((address) => address.includes(to)));
      await ctx.verify("Publish v1 puts the draft live as version 1", [
        check("live with exactly version 1 and no draft left", first.status === "live" && JSON.stringify(first.versions) === "[1]" && first.hasDraft === false, first),
        check("the published subject is Subject one", first.published === "Subject one", first.published),
        check("a send goes out with Subject one", sentOne.ok && mailOne.match?.subject === "Subject one", mailOne.match?.subject),
      ]);

      await save(ctx, id, { content: content("Subject two") });
      await tab.goto(`/modules/mailing/templates/${id}`);
      await tab.visible({ role: "button", name: "Publish changes" });
      await publishFromReview(ctx, tab, id, 2);
      const second = await stateOf(ctx, id, "after the second publish");
      const again = ctx.email("kbd-two");
      const sentTwo = await calling(ctx, "send the republished template", "send", [SLUG, { tenantId: "default", to: { email: again } }]);
      const mailTwo = await ctx.mail((message) => message.to.some((address) => address.includes(again)));
      await ctx.verify("a change published from the review is version 2", [
        check("live with versions 1 and 2 and no draft left", second.status === "live" && JSON.stringify(second.versions.toSorted((left, right) => left - right)) === "[1,2]" && second.hasDraft === false, second),
        check("the published subject is Subject two", second.published === "Subject two", second.published),
        check("a send goes out with Subject two", sentTwo.ok && mailTwo.match?.subject === "Subject two", mailTwo.match?.subject),
      ]);
    },
  },
];
