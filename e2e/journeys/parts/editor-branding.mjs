import { check, EMAIL_LOGO, mailing } from "../../mailing.mjs";
import { partsOf } from "./api-kit.mjs";
import { created, save } from "./templates-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

export const journeys = [
  {
    id: "the-canvas-header-shows-the-logo-the-sent-e-mail-carries",
    title: "with branding.logo.email.light a public PNG next to the default SVG logo, the editor canvas draws that PNG above the blocks, and a test send of the template carries the same URL",
    entryPoint: "/modules/mailing/templates/<id>, POST /api/mailing/templates/:id/test-send",
    async run(/** @type {Ctx} */ ctx) {
      const { id } = await created(ctx, { slug: "branding-logo", name: "Branding logo", category: "orders" });
      const saved = await save(ctx, id, { content: { locales: { en: { subject: "Logo", preheader: "", blocks: [{ id: "p", type: "paragraph", text: "Hello", align: "left", visibleIf: null }] } } } });
      await ctx.verify("the template has a draft", [check("the draft is saved", saved.status === 200, saved.body)], { critical: true });
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto(`/modules/mailing/templates/${id}`);
      await ctx.verify("the editor is open", [tab.visible({ role: "button", name: "Publish changes" })], { critical: true });
      const header = tab.page.locator('main img[alt=""]');
      await header.first().waitFor({ state: "attached", timeout: 15_000 }).catch(() => undefined);
      const sources = await header.evaluateAll((images) => images.map((image) => image.getAttribute("src") ?? ""));
      await ctx.verify("the canvas header draws the e-mail logo", [check("one header image, the e-mail PNG", sources.length === 1 && sources[0] === EMAIL_LOGO, sources)]);
      const recipient = ctx.email("logo");
      const sent = await mailing(ctx, "send a test", "POST", `/templates/${id}/test-send`, { body: { to: [recipient] } });
      const arrived = await ctx.mail((message) => message.to.some((address) => address.includes(recipient)));
      const html = arrived.match ? (partsOf(arrived.match).parts.find((part) => part.type === "text/html")?.text ?? "") : "";
      await ctx.verify("the test e-mail carries the same logo", [
        check("the test send is accepted", sent.status === 200, sent.body),
        check("its HTML draws the e-mail PNG", html.includes(`src="${EMAIL_LOGO}"`), html.match(/<img[^>]*>/)?.[0] ?? "no img"),
      ]);
    },
  },
];
