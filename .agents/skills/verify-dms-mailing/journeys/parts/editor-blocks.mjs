import { check } from "../../mailing.mjs";
import { plain, render, scratch, SHOWN } from "./editor-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const DATA = {
  customer: { firstName: "Sofie" },
  order: {
    n: 5,
    url: "https://shop.test/orders/1",
    lines: [
      { name: "Linen shirt", total: { value: 4800, currency: "EUR" } },
      { name: "Socks", total: { value: 900, currency: "EUR" } },
    ],
    total: { value: 987420, currency: "EUR" },
  },
  code: "AB12",
};

/**
 * @param {string} id Block id
 * @param {string} type Block type
 * @param {Record<string, unknown>} fields The rest
 * @returns {Record<string, unknown>} A visible block
 */
const block = (id, type, fields = {}) => ({ id, type, ...SHOWN, ...fields });

export const journeys = [
  {
    id: "every-block-type-renders-with-its-settings",
    title: "heading, paragraph, image, button, list, total, code, divider and footer render their text, alignment, size, link, rows and values from the test data",
    entryPoint: "POST /api/mailing/templates/:id/preview",
    async run(/** @type {Ctx} */ ctx) {
      const id = await scratch(ctx, "blocks-all");
      const out = await render(ctx, id, {
        data: DATA,
        subject: "Hi {{customer.firstName}}",
        preheader: "Pre {{customer.firstName}}",
        blocks: [
          block("hero", "hero", { imageUrl: "https://img.test/h.png", alt: "Hero alt" }),
          block("h-left", "heading", { text: "Left {{customer.firstName}}", align: "left", size: 12 }),
          block("h-right", "heading", { text: "Right heading", align: "right", size: 48 }),
          block("p-center", "paragraph", { text: "Order {{order.n}}", align: "center" }),
          block("code", "code", { text: "{{code}}" }),
          block("list", "list", { source: "order.lines", labelPath: "name", valuePath: "total" }),
          block("total", "total", { label: "Total", value: "{{order.total}}" }),
          block("button", "button", { text: "View order", href: "{{order.url}}", align: "right" }),
          block("divider", "divider"),
          block("footer", "footer", { text: "Legal line", unsubscribeLabel: "", preferencesLabel: "" }),
        ],
      });
      const text = plain(out.html);
      await ctx.verify("the preview answers the subject, the preheader and no missing variable", [
        check("200", out.status === 200, out.status),
        check("subject", out.subject === "Hi Sofie", out.subject),
        check("preheader", /display:none[^>]*>Pre Sofie</.test(out.html), out.html.slice(0, 300)),
        check("nothing is missing", JSON.stringify(out.missing) === "[]", out.missing),
        check("nothing is hidden", out.hidden.length === 0, out.hidden),
        check("the HTML carries the viewport meta tag", out.html.includes('name="viewport"'), "viewport"),
      ]);
      await ctx.verify("each block renders", [
        check("image with its alt", /<img src="https:\/\/img\.test\/h\.png" alt="Hero alt"/.test(out.html), "img"),
        check("heading left at 12px", /<h1[^>]*font-size:12px[^>]*text-align:left[^>]*>\s*Left Sofie</.test(out.html), "h1 left"),
        check("heading right at 48px", /<h1[^>]*font-size:48px[^>]*text-align:right[^>]*>\s*Right heading</.test(out.html), "h1 right"),
        check("paragraph centred", /<p[^>]*text-align:center[^>]*>\s*Order 5</.test(out.html), "p"),
        check("code", /letter-spacing:6px[^>]*>AB12</.test(out.html), "code"),
        check("list rows in order with formatted values", /Linen shirt[\s\S]*?€48\.00[\s\S]*?Socks[\s\S]*?€9\.00/.test(out.html), text),
        check("total label and value", /font-weight:600;">Total<[\s\S]*?€9,874\.20</.test(out.html), text),
        check("button text, link and alignment", /margin:24px 0;text-align:right;"><tbody><tr><td><a href="https:\/\/shop\.test\/orders\/1"[^>]*>View order</.test(out.html), "button"),
        check("divider", out.html.includes("<hr"), "hr"),
        check("footer text", text.includes("Legal line"), text),
        check("a footer without labels has no unsubscribe or preferences link", !/unsubscribe|preferences/i.test(text), text),
      ]);
      const short = await render(ctx, id, { data: DATA, blocks: [block("h", "heading", { text: "Bounded", align: "left", size: 24 })] });
      await ctx.verify("a heading renders the size it was given", [check("24px", /<h1[^>]*font-size:24px/.test(short.html), "h1")]);
    },
  },
  {
    id: "visibility-rules-compare-a-variable-with-a-value",
    title: "a block shows only if a variable is filled, empty, equal, different, greater or lower, and a condition block shows its if branch or its else branch",
    entryPoint: "POST /api/mailing/templates/:id/preview",
    async run(/** @type {Ctx} */ ctx) {
      const id = await scratch(ctx, "blocks-visibility");
      /** @param {string} blockId @param {string} path @param {string} operator @param {string} value @returns {Record<string, unknown>} A paragraph with a rule */
      const rule = (blockId, path, operator, value) => ({ ...block(blockId, "paragraph", { text: `Rule ${blockId}`, align: "left" }), visibleIf: { path, operator, value } });
      const data = { name: "Sofie", empty: "", n: 10, small: 5, zero: 0 };
      /** @type {[string, string, string, string, boolean][]} */
      const rules = [
        ["truthy-filled", "name", "truthy", "", true],
        ["truthy-empty", "empty", "truthy", "", false],
        ["truthy-missing", "nope", "truthy", "", false],
        ["falsy-empty", "empty", "falsy", "", true],
        ["falsy-missing", "nope", "falsy", "", true],
        ["falsy-filled", "name", "falsy", "", false],
        ["eq-same", "name", "eq", "Sofie", true],
        ["eq-other", "name", "eq", "Ana", false],
        ["ne-other", "name", "ne", "Ana", true],
        ["ne-same", "name", "ne", "Sofie", false],
        ["gt-greater", "n", "gt", "9", true],
        ["gt-equal", "n", "gt", "10", false],
        ["gt-lower", "small", "gt", "9", false],
        ["lt-lower", "small", "lt", "9", true],
        ["lt-equal", "n", "lt", "10", false],
        ["lt-greater", "n", "lt", "9", false],
      ];
      const out = await render(ctx, id, { data, blocks: rules.map(([blockId, path, operator, value]) => rule(blockId, path, operator, value)) });
      const text = plain(out.html);
      await ctx.verify("every operator shows and hides the right blocks", rules.map(([blockId, , , , shown]) =>
        check(`${blockId} is ${shown ? "shown" : "hidden"}`, text.includes(`Rule ${blockId}`) === shown && out.hidden.includes(blockId) === !shown, { hidden: out.hidden }),
      ));
      /** @param {string} path @param {string} operator @param {string} value @returns {Record<string, unknown>} A condition block */
      const group = (path, operator, value) => ({
        ...block("group", "if", {
          condition: { path, operator, value },
          children: [block("yes", "paragraph", { text: "If branch", align: "left" })],
          elseChildren: [block("no", "paragraph", { text: "Else branch", align: "left" })],
        }),
      });
      const yes = await render(ctx, id, { data, blocks: [group("name", "eq", "Sofie")] });
      const no = await render(ctx, id, { data, blocks: [group("name", "eq", "Ana")] });
      await ctx.verify("a condition block shows its if branch when the rule holds and its else branch otherwise", [
        check("if branch shown", plain(yes.html).includes("If branch") && !plain(yes.html).includes("Else branch"), plain(yes.html)),
        check("else branch shown", plain(no.html).includes("Else branch") && !plain(no.html).includes("If branch"), plain(no.html)),
      ]);
    },
  },
];
