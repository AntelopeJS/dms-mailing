import { check, mailing, parseJson, pick, text } from "../../mailing.mjs";
import { declareLive, partsOf, sendCode, sendDetail, subjectOfHead } from "./api-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const LABELS = ["money", "moneyjpy", "moneyodd", "date", "isoday", "isomoment", "isoplain", "number", "formatted", "count", "first", "missing", "own", "row"];

/**
 * @param {string} locale The locale
 * @param {number} minor An amount in the minor unit
 * @param {string} currency The ISO 4217 code
 * @param {number} digits The currency's fraction digits
 * @returns {string} The amount as the e-mail must write it
 */
const money = (locale, minor, currency, digits = 2) => new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 10 ** digits);

/**
 * @param {string} locale The locale
 * @param {string} iso An instant
 * @param {string} [timeZone] The time zone, the server's when absent
 * @returns {string} The date in the long style
 */
const day = (locale, iso, timeZone) => new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone }).format(new Date(iso));

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
export const values = {
  id: "amounts-and-dates-are-written-in-the-locale-of-the-send",
  title: "a money value, a Date and an ISO date at a path declared date are written in the locale of the send (en and fr) in the subject, the body, a total and the list rows; an unknown currency writes a plain number; numbers, other strings and already formatted text stay as given; the log keeps the values as passed",
  entryPoint: "SendTemplate(slug, { variables })",
  async run(ctx) {
    const line = (/** @type {string} */ id, /** @type {string} */ token) => ({ id, type: "paragraph", text: `${id}=${token}`, align: "left", visibleIf: null });
    const template = await declareLive(ctx, "values-order", {
      locales: {
        en: { subject: "Quote {{quote.total}} until {{quote.validUntil}}", blocks: [line("money", "{{quote.total}}"), line("moneyjpy", "{{quote.yen}}"), line("moneyodd", "{{quote.odd}}"), line("date", "{{when}}"), line("isoday", "{{quote.validUntil}}"), line("isomoment", "{{quote.at}}"), line("isoplain", "{{quote.plain}}"), line("number", "{{order.number}}"), line("formatted", "{{quote.formatted}}"), line("count", "{{items.length}}"), line("first", "{{items.0.name}}"), line("missing", "[{{items.5.name}}]"), line("own", "[{{quote.toString}}]"), { id: "l", type: "list", source: "items", labelPath: "name", valuePath: "price", visibleIf: null }, { id: "t", type: "total", label: "Total", value: "{{quote.total}}", visibleIf: null }] },
        fr: { subject: "Devis {{quote.total}} jusqu'au {{quote.validUntil}}", blocks: [line("money", "{{quote.total}}"), line("moneyjpy", "{{quote.yen}}"), line("moneyodd", "{{quote.odd}}"), line("date", "{{when}}"), line("isoday", "{{quote.validUntil}}"), line("isomoment", "{{quote.at}}"), line("isoplain", "{{quote.plain}}"), line("number", "{{order.number}}"), line("formatted", "{{quote.formatted}}"), line("count", "{{items.length}}"), line("first", "{{items.0.name}}"), line("missing", "[{{items.5.name}}]"), line("own", "[{{quote.toString}}]"), { id: "l", type: "list", source: "items", labelPath: "name", valuePath: "price", visibleIf: null }, { id: "t", type: "total", label: "Total", value: "{{quote.total}}", visibleIf: null }] },
      },
      variables: [
        { path: "quote.validUntil", type: "date", required: false },
        { path: "quote.at", type: "date", required: false },
        { path: "quote.total", type: "money", required: false },
      ],
    });
    const variables = {
      quote: { total: { value: 987420, currency: "EUR" }, yen: { value: 5000, currency: "JPY" }, odd: { value: 987420, currency: "NOPE" }, validUntil: "2026-11-14", at: "2026-11-14T09:30:00Z", plain: "2026-11-14", formatted: "9 874,20 €" },
      when: { $date: "2026-11-14T12:00:00Z" },
      order: { number: 12345 },
      items: [{ name: "Pro plan", price: { value: 2500, currency: "EUR" } }, { name: "Support", price: { value: 100, currency: "EUR" } }],
    };
    for (const locale of ["en", "fr"]) {
      const to = ctx.email(`values-${locale}`);
      const sent = await sendCode(ctx, `send in ${locale}`, template.slug, { to, locale, variables });
      const arrived = await ctx.mail((message) => message.to.some((address) => address.includes(to)));
      const message = arrived.match;
      const plain = message ? (partsOf(message).parts.find((part) => part.type === "text/plain")?.text ?? "") : "";
      const html = message ? (partsOf(message).parts.find((part) => part.type === "text/html")?.text ?? "") : "";
      const normal = (/** @type {string} */ value) => value.replace(/[  ]/g, " ");
      const expected = {
        money: money(locale, 987420, "EUR"),
        moneyjpy: money(locale, 5000, "JPY", 0),
        moneyodd: new Intl.NumberFormat(locale).format(987420),
        date: day(locale, "2026-11-14T12:00:00Z"),
        isoday: day(locale, "2026-11-14", "UTC"),
        isomoment: day(locale, "2026-11-14T09:30:00Z"),
        isoplain: "2026-11-14",
        number: "12345",
        formatted: "9 874,20 €",
        count: "2",
        first: "Pro plan",
        missing: "[]",
        own: "[]",
      };
      await ctx.verify(`${locale}: the subject and every value as the e-mail writes it`, [
        check("the call is sent", text(sent.result, "status") === "sent", sent.result),
        check("the subject writes the amount and the date", normal(message ? subjectOfHead(partsOf(message).head) : "") === normal(`${locale === "fr" ? "Devis" : "Quote"} ${expected.money} ${locale === "fr" ? "jusqu'au" : "until"} ${expected.isoday}`), message?.subject),
        ...LABELS.filter((label) => Object.hasOwn(expected, label)).map((label) => check(`${label} reads ${JSON.stringify(expected[/** @type {keyof typeof expected} */ (label)])}`, normal(plain).includes(normal(`${label}=${expected[/** @type {keyof typeof expected} */ (label)]}`)), plain)),
        check("the list rows write their amounts", normal(plain).includes(normal(`Pro plan${locale === "fr" ? " : " : ": "}${money(locale, 2500, "EUR")}`)) && normal(plain).includes(normal(`Support${locale === "fr" ? " : " : ": "}${money(locale, 100, "EUR")}`)), plain),
        check("the total block writes the amount", normal(plain).includes(normal(`Total${locale === "fr" ? " : " : ": "}${expected.money}`)), plain),
        check("the HTML part writes the amount and the dates too", normal(html).includes(normal(expected.money)) && normal(html).includes(normal(expected.date)), html.length),
      ]);
      const detail = await sendDetail(ctx, text(sent.result, "sendId"));
      const kept = parseJson(text(detail.send, "json_variables"));
      await ctx.verify(`${locale}: the send log keeps the values as passed`, [
        check("the money value is an object with its minor amount", pick(kept, "quote", "total", "value") === 987420 && pick(kept, "quote", "total", "currency") === "EUR", pick(kept, "quote", "total")),
        check("the ISO day is the string passed", pick(kept, "quote", "validUntil") === "2026-11-14", pick(kept, "quote", "validUntil")),
        check("the Date is stored as its ISO time", text(kept, "when").startsWith("2026-11-14T12:00:00"), pick(kept, "when")),
        check("the number stays a number", pick(kept, "order", "number") === 12345, pick(kept, "order", "number")),
      ]);
    }
    const preview = await mailing(ctx, "preview the template in French with the same data", "POST", `/templates/${template.id}/preview`, { body: { locale: "fr", data: { ...variables, when: "2026-11-14T12:00:00Z" } } });
    await ctx.verify("a preview formats at render time too", [check("the amount in French", (pick(preview.body, "html") ? String(pick(preview.body, "html")) : "").replace(/[  ]/g, " ").includes(money("fr", 987420, "EUR").replace(/[  ]/g, " ")), pick(preview.body, "subject"))]);
  },
};
