import { check, list, mailing, pick, text } from "../../mailing.mjs";
import { paragraph } from "./api-kit.mjs";
import { wait } from "./browser-kit.mjs";
import { created, save } from "./templates-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */
/** @typedef {import("../../mailing.mjs").Tab} Tab */

const HYDRATION_ATTEMPTS = 15;
const HYDRATION_WAIT_MS = 2000;
const SETTLE_MS = 600;
const LOCATOR_TIMEOUT_MS = 10_000;
const DESKTOP_WIDTH = 600;
const MOBILE_WIDTH = 380;
const PUBLISH_CHANGES = { role: "button", name: /^Publish changes/ };
const WIDE_VIEWPORT = { width: 1920, height: 1080 };

/**
 * Creates a draft template with one English paragraph and opens it in the editor.
 *
 * @param {Ctx} ctx The journey
 * @param {string} slug The slug, also its name
 * @param {{ subject: string, body: string, variables?: unknown[] }} draft The draft's subject, paragraph and declarations
 * @returns {Promise<{ id: string, tab: Tab }>} The template and the editor tab
 */
async function openDraft(ctx, slug, draft) {
  const { id } = await created(ctx, { slug, name: slug, category: "orders" });
  const saved = await save(ctx, id, {
    content: { locales: { en: { subject: draft.subject, preheader: "", blocks: [paragraph("p", draft.body)] } } },
    variables: draft.variables ?? [],
  });
  await ctx.verify(`the ${slug} draft is saved`, [check("save answers 200", saved.status === 200, saved.body)], { critical: true });
  const tab = await ctx.tab();
  await tab.signIn("admin");
  await tab.goto(`/modules/mailing/templates/${id}`);
  await tab.visible(PUBLISH_CHANGES);
  return { id, tab };
}

/**
 * Clicks a toolbar button until the dialog it opens shows: the page renders on the server and hydrates after `load`,
 * and a click before that does nothing.
 *
 * @param {Tab} tab The editor tab
 * @param {import("../../mailing.mjs").Target} button The toolbar button
 * @param {string | RegExp} dialog The name of the dialog it opens
 * @returns {Promise<void>}
 */
async function openDialog(tab, button, dialog) {
  for (let attempt = 0; attempt < HYDRATION_ATTEMPTS; attempt += 1) {
    await tab.click(button);
    const shown = await tab.visible({ role: "dialog", name: dialog }, { timeoutMs: HYDRATION_WAIT_MS });
    if (shown.pass) return;
  }
}

/**
 * @param {Tab} tab The editor tab
 * @returns {Promise<number>} The width of the e-mail paper on the canvas, in pixels
 */
async function paperWidth(tab) {
  const box = await tab.page.locator("main .mx-auto.max-w-full").first().boundingBox({ timeout: LOCATOR_TIMEOUT_MS });
  return Math.round(Number(pick(box, "width") ?? 0));
}

export const journeys = [
  {
    id: "the-test-dialog-sends-the-draft-to-every-address-given-as-a-test",
    title: "Test in the editor opens Send a test on the editor draft with the owner's address, an address added with Enter makes it Send 2 tests, and both addresses receive the unpublished draft's subject behind [TEST], logged as tests",
    entryPoint: "/modules/mailing/templates/<id>, Test, POST /api/mailing/templates/:id/test-send",
    async run(/** @type {Ctx} */ ctx) {
      const { id, tab } = await openDraft(ctx, "editor-test-send", { subject: "Draft only subject", body: "Hello from the draft" });
      await openDialog(tab, { role: "button", name: "Test", exact: true }, "Send a test");
      const owner = String(pick(ctx.state.accounts, "admin", "email"));
      const second = ctx.email("tess");
      await ctx.verify("the dialog sends the editor draft to the owner by default", [
        tab.visible({ role: "dialog", name: "Send a test" }),
        tab.shows(/editor draft/),
        tab.visible({ role: "button", name: owner }),
        tab.visible({ role: "button", name: "Send 1 test" }),
      ], { critical: true });
      await tab.fill({ role: "textbox", name: "Recipients" }, second);
      await tab.press("Enter");
      await ctx.verify("an address added with Enter joins the recipients", [tab.visible({ role: "button", name: second }), tab.visible({ role: "button", name: "Send 2 tests" })], { critical: true });
      await tab.click({ role: "button", name: "Send 2 tests" });
      const toOwner = await ctx.mail((message) => message.to.some((address) => address.includes(owner)));
      const toSecond = await ctx.mail((message) => message.to.some((address) => address.includes(second)));
      await ctx.verify("both addresses receive the draft as a test", [
        check("the owner's subject is [TEST] Draft only subject", toOwner.match?.subject === "[TEST] Draft only subject", toOwner.match?.subject),
        check("the added address's subject is [TEST] Draft only subject", toSecond.match?.subject === "[TEST] Draft only subject", toSecond.match?.subject),
      ]);
      const sends = await mailing(ctx, "read the send log", "GET", "/tables/sends/list?limit=50");
      const tests = list(sends.body, "results").filter((send) => text(send, "templateSlug") === "editor-test-send" && pick(send, "isTest") === true);
      const versions = await mailing(ctx, "list the versions", "GET", `/templates/${id}/versions`);
      await ctx.verify("the log keeps two test sends and the template stays unpublished", [
        check("two test sends of editor-test-send", tests.length === 2, tests),
        check("no published version", list(versions.body, "versions").length === 0, versions.body),
      ]);
    },
  },
  {
    id: "the-publish-review-blocks-an-empty-subject-until-the-subject-is-written",
    title: "Publish changes on a draft without a subject lists the added locale and the empty subject as a problem with Publish v1 disabled; once the subject is written in the Template tab the review lists no problem and Publish v1 makes the template live with that subject",
    entryPoint: "/modules/mailing/templates/<id>, Publish changes, Template tab, POST /api/mailing/templates/:id/publish",
    async run(/** @type {Ctx} */ ctx) {
      const { id, tab } = await openDraft(ctx, "editor-empty-subject", { subject: "", body: "Your order is ready" });
      await openDialog(tab, PUBLISH_CHANGES, /^Publish /);
      await ctx.verify("the review blocks the publish on the empty subject", [
        tab.shows(/EN · Locale added/),
        tab.shows(/1 problem blocks the publish/),
        tab.shows(/EN: the subject is empty\./),
        tab.enabled({ role: "button", name: "Publish v1" }, { disabled: true }),
      ], { critical: true });
      await tab.click({ role: "button", name: "Keep editing" });
      await tab.visible({ role: "dialog" }, { hidden: true });
      await tab.click({ role: "button", name: /^Subject/ });
      await tab.page.getByRole("complementary").locator("textarea").first().fill("Ready for pickup", { timeout: LOCATOR_TIMEOUT_MS });
      await tab.press("Control+s");
      await wait(tab, SETTLE_MS);
      await openDialog(tab, PUBLISH_CHANGES, /^Publish /);
      await ctx.verify("the written subject clears the problem", [
        tab.shows(/EN · Locale added/),
        tab.enabled({ role: "button", name: "Publish v1" }, { disabled: false }),
      ], { critical: true });
      await tab.click({ role: "button", name: "Publish v1" });
      await tab.visible({ role: "dialog" }, { hidden: true });
      const editor = await mailing(ctx, "read the published content", "GET", `/templates/${id}/content`);
      await ctx.verify("the template is live with the subject written in the editor", [
        check("published subject", pick(editor.body, "publishedContent", "locales", "en", "subject") === "Ready for pickup", pick(editor.body, "publishedContent")),
      ]);
    },
  },
  {
    id: "the-device-and-preview-switches-change-the-canvas",
    title: "Mobile narrows the e-mail on the canvas from 600 to 380 pixels and Desktop widens it back; Data shows the test data in place of a token and Variables shows the token again",
    entryPoint: "/modules/mailing/templates/<id>, Device and Preview switches",
    async run(/** @type {Ctx} */ ctx) {
      const variables = [{ path: "customer.firstName", type: "string", required: false }];
      const { id, tab } = await openDraft(ctx, "editor-switches", { subject: "Switches", body: "Hello {{customer.firstName}}", variables });
      const data = await mailing(ctx, "save the test data", "POST", `/templates/${id}/test-data`, { body: { data: { customer: { firstName: "Ada" } } } });
      await ctx.verify("the test data is saved", [check("HTTP 200", data.status === 200, data.body)], { critical: true });
      await tab.page.setViewportSize(WIDE_VIEWPORT);
      await tab.reload();
      await tab.visible(PUBLISH_CHANGES);
      await wait(tab, SETTLE_MS);
      const desktop = await paperWidth(tab);
      await tab.click({ role: "radio", name: "Mobile" });
      await wait(tab, SETTLE_MS);
      const mobile = await paperWidth(tab);
      await tab.click({ role: "radio", name: "Desktop" });
      await wait(tab, SETTLE_MS);
      const back = await paperWidth(tab);
      await ctx.verify("the device switch sets the width of the e-mail", [
        check(`Desktop is ${DESKTOP_WIDTH} px`, desktop === DESKTOP_WIDTH, desktop),
        check(`Mobile is ${MOBILE_WIDTH} px`, mobile === MOBILE_WIDTH, mobile),
        check(`Desktop again is ${DESKTOP_WIDTH} px`, back === DESKTOP_WIDTH, back),
      ]);
      await ctx.verify("Variables shows the token", [tab.shows(/Hello \{\{customer\.firstName\}\}/)]);
      await tab.click({ role: "radio", name: "Data" });
      await ctx.verify("Data shows the test data in place of the token", [tab.shows(/Hello Ada/)]);
      await tab.click({ role: "radio", name: "Variables" });
      await ctx.verify("Variables shows the token again", [tab.shows(/Hello \{\{customer\.firstName\}\}/)]);
    },
  },
  {
    id: "a-variable-declared-in-the-variables-tab-is-saved-in-the-draft",
    title: "Declare a variable in the Variables tab takes a path, a type and the Required switch, lists the variable, and the saved draft declares it with that type and flag while the published template has no declaration yet",
    entryPoint: "/modules/mailing/templates/<id>, Variables tab, Declare a variable",
    async run(/** @type {Ctx} */ ctx) {
      const { id, tab } = await openDraft(ctx, "editor-declare", { subject: "Declare", body: "Total {{order.total}}" });
      await tab.click({ role: "tab", name: /^Variables/ });
      for (let attempt = 0; attempt < HYDRATION_ATTEMPTS; attempt += 1) {
        await tab.click({ role: "button", name: "Declare a variable" });
        const form = await tab.visible({ role: "textbox", name: "Path" }, { timeoutMs: HYDRATION_WAIT_MS });
        if (form.pass) break;
      }
      await tab.fill({ role: "textbox", name: "Path" }, "order.total");
      await tab.click({ role: "combobox", name: "Type" });
      await tab.click({ role: "option", name: "Amount" });
      await tab.click({ role: "switch", name: "Required" });
      await tab.click({ role: "button", name: "Add", exact: true });
      await ctx.verify("the Variables tab lists the declaration", [tab.visible({ role: "tab", name: "Variables 1" }), tab.visible({ role: "button", name: "order.total" })], { critical: true });
      await tab.press("Control+s");
      await wait(tab, SETTLE_MS);
      const read = await mailing(ctx, "read the draft", "GET", `/templates/${id}/content`);
      const declared = list(read.body, "variables").find((entry) => text(entry, "path") === "order.total");
      await ctx.verify("the saved draft declares the variable with its type and flag", [
        check("order.total is declared", declared !== undefined, pick(read.body, "variables")),
        check("its type is Amount (money)", text(declared, "type") === "money", declared),
        check("it is required", pick(declared, "required") === true, declared),
      ]);
    },
  },
];
