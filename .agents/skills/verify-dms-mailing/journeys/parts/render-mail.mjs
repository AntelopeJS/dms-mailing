import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { check, mailing, text, withConfig } from "../../mailing.mjs";
import { block, declareRich, inOrder, RICH_BLOCKS, RICH_VARIABLES, sentMessage } from "./render-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1">';
const PLAIN_EN = [
  "Hero alt", "Hello Sofie", "Line one\nLine two", "123456", "Pro: 10.00\nPlus: 38.00", "Total: 48.00", "Pay now: https://pay.example.com/A9", "----------",
  "----------\nAcme Ltd\nUnsubscribe: https://app.example.com/unsub/1\nPreferences: https://app.example.com/prefs",
].join("\n\n");
const FALLBACK_WARNING = "[dms-mailing] html-render unavailable, using fallback";

/**
 * @param {Ctx} ctx The journey
 * @returns {number} The size of the backend log now
 */
const logSize = (ctx) => statSync(join(ctx.state.logs, "backend.log")).size;

/**
 * @param {Ctx} ctx The journey
 * @param {number} from A size of the backend log
 * @returns {string} What the backend logged since
 */
const logSince = (ctx, from) => readFileSync(join(ctx.state.logs, "backend.log")).subarray(from).toString("utf8");

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} */
export const mailJourneys = [
  {
    id: "every-e-mail-is-multipart-alternative-with-html-and-plain-text-from-the-same-blocks",
    title: "every e-mail goes out as multipart/alternative with a plain-text part and an HTML part drawn from the same blocks in the same order, the footer last; the HTML carries the viewport meta tag; the plain text writes each block kind as the rules say, with the language's label separator; the three send paths agree",
    entryPoint: "SendTemplate, POST /api/mailing/templates/:id/{test-send,send}",
    async run(ctx) {
      const template = await declareRich(ctx, "multipart-order");
      const message = await sentMessage(ctx, template.slug, "mp");
      await ctx.verify("the structure of the message", [
        check("the top content type is multipart/alternative", message.contentType === "multipart/alternative", message.contentType),
        check("exactly two parts, plain text first and HTML second", JSON.stringify(message.parts.map((part) => part.type)) === '["text/plain","text/html"]', message.parts.map((part) => part.type)),
        check("the subject is the rendered one", message.subject === "Rich A9", message.subject),
      ]);
      await ctx.verify("the HTML part", [
        check("it carries the viewport meta tag", message.html.includes(VIEWPORT), message.html.slice(0, 300)),
        check("it is an HTML document in the language of the send", message.html.startsWith("<!doctype html><html lang=\"en\">") && message.html.includes('<meta charset="utf-8">'), message.html.slice(0, 120)),
        check("the title is the subject and the preheader is hidden text", message.html.includes("<title>Rich A9</title>") && message.html.includes(">Pre header</div>"), "title"),
        check("the blocks are in order and the footer is last", inOrder(message.html, ['src="https://img.example.com/a.png"', "Hello Sofie", "Line one", "123456", "Pro", "10.00", "Plus", "38.00", "Total", "48.00", 'href="https://pay.example.com/A9"', "Pay now", 'href="https://app.example.com/unsub/1"', "Unsubscribe", 'href="https://app.example.com/prefs"', "Preferences"]), "order"),
        check("the hero image keeps its alt text", message.html.includes('alt="Hero alt"'), "alt"),
      ]);
      await ctx.verify("the plain-text part writes every block kind", [
        check("the whole text, block by block", message.plain.replace(/\r/g, "") === PLAIN_EN, JSON.stringify(message.plain)),
      ]);
      const french = await sentMessage(ctx, template.slug, "mp-fr", { locale: "fr" });
      await ctx.verify("French spaces a colon off its label with a no-break space", [
        check("labels read `Total : 48.00`", french.plain.includes("Total : 48.00") && french.plain.includes("Pro : 10.00") && french.plain.includes("Pay now : https://pay.example.com/A9") && french.plain.includes("Unsubscribe : https://app.example.com/unsub/1"), JSON.stringify(french.plain)),
        check("the HTML is in French", french.html.includes('<html lang="fr">') && french.subject === "Riche A9", french.subject),
      ]);
      const test = await mailing(ctx, "test send", "POST", `/templates/${template.id}/test-send`, { body: { to: [ctx.email("mp-test")], data: RICH_VARIABLES } });
      const real = await mailing(ctx, "real send", "POST", `/templates/${template.id}/send`, { body: { to: [ctx.email("mp-real")], data: RICH_VARIABLES } });
      const testMail = await ctx.mail((entry) => entry.to.some((address) => address.includes(ctx.email("mp-test"))));
      const realMail = await ctx.mail((entry) => entry.to.some((address) => address.includes(ctx.email("mp-real"))));
      await ctx.verify("the test and the real send are multipart too", [
        check("both accepted", test.status === 200 && real.status === 200, [test.status, real.status]),
        check("both carry a plain-text and an HTML part", [testMail.match, realMail.match].every((entry) => entry !== undefined && readFileSync(entry.file, "utf8").includes("Content-Type: text/plain") && readFileSync(entry.file, "utf8").includes("Content-Type: text/html")), "parts"),
      ]);
    },
  },
  {
    id: "footer-links-are-system-variables-dropped-when-missing-or-unlabelled",
    title: "a footer with an unsubscribe and a preferences label writes both links in the HTML and the plain text from unsubscribeUrl and preferencesUrl; a link whose URL is missing is dropped and so is one whose label is empty; a footer without text or links draws nothing",
    entryPoint: "SendTemplate(slug, { variables: { unsubscribeUrl, preferencesUrl } })",
    async run(ctx) {
      const template = await declareRich(ctx, "footer-order");
      const both = await sentMessage(ctx, template.slug, "ft-both");
      await ctx.verify("both URLs: both links in HTML and plain text", [
        check("HTML links", both.html.includes('href="https://app.example.com/unsub/1"') && both.html.includes('href="https://app.example.com/prefs"'), both.html.length),
        check("plain-text lines", both.plain.endsWith("Unsubscribe: https://app.example.com/unsub/1\nPreferences: https://app.example.com/prefs"), JSON.stringify(both.plain.slice(-120))),
      ]);
      const onlyUnsubscribe = await sentMessage(ctx, template.slug, "ft-one", { variables: { ...RICH_VARIABLES, preferencesUrl: undefined } });
      await ctx.verify("a missing preferences URL drops that link only", [
        check("no preferences link, the unsubscribe link stays", !onlyUnsubscribe.html.includes("Preferences") && onlyUnsubscribe.html.includes("Unsubscribe") && !onlyUnsubscribe.plain.includes("Preferences") && onlyUnsubscribe.plain.endsWith("Unsubscribe: https://app.example.com/unsub/1"), JSON.stringify(onlyUnsubscribe.plain.slice(-100))),
      ]);
      const noLabel = await declareRich(ctx, "footer-nolabel", RICH_BLOCKS.map((entry) => (entry.type === "footer" ? { ...entry, preferencesLabel: "" } : entry)));
      const unlabelled = await sentMessage(ctx, noLabel.slug, "ft-nolabel");
      await ctx.verify("an empty label removes the link though the URL is passed", [
        check("no preferences link in the HTML or the text, the unsubscribe link stays", !unlabelled.html.includes("https://app.example.com/prefs") && !unlabelled.plain.includes("prefs") && unlabelled.html.includes("https://app.example.com/unsub/1"), JSON.stringify(unlabelled.plain.slice(-100))),
      ]);
      const bare = await declareRich(ctx, "footer-bare", [block("p", "paragraph", { text: "Only text", align: "left" }), block("f", "footer", { text: "", unsubscribeLabel: "", preferencesLabel: "" })]);
      const empty = await sentMessage(ctx, bare.slug, "ft-bare", { variables: {} });
      await ctx.verify("an empty footer draws nothing", [check("the text part is the paragraph alone", empty.plain.replace(/\r/g, "") === "Only text", JSON.stringify(empty.plain)), check("no divider rule after the paragraph", !empty.plain.includes("----------"), JSON.stringify(empty.plain))]);
    },
  },
  {
    id: "use-html-render-picks-the-renderer-and-a-failing-renderer-falls-back",
    title: "useHtmlRender true (the default) draws the e-mail through the DMS html-render chain, false through the module's standalone renderer; when the DMS renderer fails the module sends with the standalone one and logs `[dms-mailing] html-render unavailable, using fallback`; the plain text is the same either way and neither draws a logo, which the DMS branding gives as an SVG or at a host a mail client cannot load",
    entryPoint: "VERIFY_MAILING_HTML_RENDER, SendTemplate",
    async run(ctx) {
      const template = await declareRich(ctx, "render-order", RICH_BLOCKS.filter((entry) => entry.type !== "hero"));
      const beforeDefault = logSize(ctx);
      const chain = await sentMessage(ctx, template.slug, "rn-default");
      await ctx.verify("the default is the DMS chain", [
        check("lower-case doctype, the DMS layout and the viewport tag", chain.html.startsWith("<!doctype html>") && chain.html.includes(VIEWPORT) && chain.html.includes("max-width:37.5em"), chain.html.slice(0, 160)),
        check("no logo: the layout draws none for a host a mail client cannot load", !chain.html.includes("<img"), chain.html.match(/<img[^>]*>/)?.[0]),
        check("nothing logged about a fallback", !logSince(ctx, beforeDefault).includes(FALLBACK_WARNING), "logged"),
      ]);
      /** @type {Record<string, { html: string, plain: string }>} */
      const seen = {};
      await withConfig(ctx, { VERIFY_MAILING_HTML_RENDER: "0" }, async () => {
        const before = logSize(ctx);
        const standalone = await sentMessage(ctx, template.slug, "rn-off");
        seen.off = standalone;
        await ctx.verify("false: the standalone renderer", [
          check("upper-case doctype, 600 pixel table, a hidden preheader span", standalone.html.startsWith('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">') && standalone.html.includes('width="600"') && standalone.html.includes('<span style="display:none;max-height:0;overflow:hidden">Pre header</span>'), standalone.html.slice(0, 200)),
          check("the viewport tag is there too", standalone.html.includes(VIEWPORT), "viewport"),
          check("the blocks and the footer are in order", inOrder(standalone.html, ["Hello Sofie", "Line one", "123456", "Pro", "Total", 'href="https://pay.example.com/A9"', "Unsubscribe", "Preferences"]), "order"),
          check("it draws no logo", !standalone.html.includes("<img"), "img"),
          check("the renderer was chosen, not fallen back to: nothing logged", !logSince(ctx, before).includes(FALLBACK_WARNING), "logged"),
        ]);
      });
      await withConfig(ctx, { VERIFY_MAILING_HTML_RENDER: "1" }, async () => {
        const on = await sentMessage(ctx, template.slug, "rn-on");
        seen.on = on;
        await ctx.verify("true: the DMS chain again", [check("lower-case doctype", on.html.startsWith("<!doctype html>"), on.html.slice(0, 40))]);
      });
      await withConfig(ctx, { VERIFY_MAILING_HTML_RENDER: "broken" }, async () => {
        const before = logSize(ctx);
        const broken = await sentMessage(ctx, template.slug, "rn-broken");
        for (let attempt = 0; attempt < 20 && !logSince(ctx, before).includes(FALLBACK_WARNING); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 500));
        seen.broken = broken;
        await ctx.verify("a failing DMS renderer falls back and says so", [
          check("the send still succeeds", text(broken.result, "status") === "sent", broken.result),
          check("the e-mail is the standalone renderer's", broken.html.startsWith("<!DOCTYPE html>") && broken.html.includes('width="600"'), broken.html.slice(0, 60)),
          check("the warning is logged", logSince(ctx, before).includes(FALLBACK_WARNING), "the backend log holds no such line"),
        ]);
      });
      await ctx.verify("the plain text does not depend on the renderer", [
        check("the same text with the chain, the standalone renderer and the fallback", chain.plain === seen.off?.plain && chain.plain === seen.on?.plain && chain.plain === seen.broken?.plain, [chain.plain.length, seen.off?.plain.length, seen.broken?.plain.length]),
      ]);
    },
  },
];
