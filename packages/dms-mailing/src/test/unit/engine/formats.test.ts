import { expect } from "chai";
import {
  formatValue,
  interpolate,
  resolveEmail,
  valueFormatOf,
} from "../../../engine";
import type { LocaleContent } from "../../../types";

/** Intl separates with no-break spaces: compare with plain ones. */
const plain = (text: string): string => text.replace(/\s/g, " ");

const TOTAL = { value: 987420, currency: "EUR" };
const DATE_VARIABLES = [
  { path: "quote.validUntil", type: "date" as const, required: true },
];

describe("[unit] engine/formats", () => {
  it("writes a money value in the locale, from its minor unit", () => {
    expect(plain(formatValue(TOTAL, "", valueFormatOf("fr")))).to.equal(
      "9 874,20 €",
    );
    expect(formatValue(TOTAL, "", valueFormatOf("en"))).to.equal("€9,874.20");
    expect(
      formatValue({ value: 1500, currency: "JPY" }, "", valueFormatOf("en")),
    ).to.equal("¥1,500");
  });

  it("writes an unknown currency as a plain number", () => {
    const amount = { value: 1234, currency: "not a currency" };
    expect(formatValue(amount, "", valueFormatOf("en"))).to.equal("1,234");
  });

  it("writes an ISO string as a date only at a path declared date", () => {
    const format = valueFormatOf("fr", DATE_VARIABLES);
    expect(formatValue("2026-11-14", "quote.validUntil", format)).to.equal(
      "14 novembre 2026",
    );
    expect(formatValue("2026-11-14", "quote.number", format)).to.equal(
      "2026-11-14",
    );
    expect(
      formatValue("samedi 14 novembre", "quote.validUntil", format),
    ).to.equal("samedi 14 novembre");
  });

  it("writes a Date in the locale wherever it appears", () => {
    const noon = new Date(Date.UTC(2026, 10, 14, 12));
    expect(formatValue(noon, "any.path", valueFormatOf("en-GB"))).to.equal(
      "14 November 2026",
    );
  });

  it("leaves strings and numbers as the caller wrote them", () => {
    const format = valueFormatOf("fr", DATE_VARIABLES);
    expect(formatValue("9 874,20 €", "quote.total", format)).to.equal(
      "9 874,20 €",
    );
    expect(formatValue(12345, "order.number", format)).to.equal("12345");
  });

  it("writes a boolean, a list and a record the way String() does", () => {
    expect(formatValue(true)).to.equal("true");
    expect(formatValue(["a", 2, null, ["b"]])).to.equal("a,2,,b");
    expect(formatValue({ a: 1 })).to.equal("[object Object]");
  });

  it("falls back to English for a locale the runtime cannot format", () => {
    expect(valueFormatOf("not a locale").locale).to.equal("en");
  });

  it("formats tokens, list cells and the subject of a resolved e-mail", () => {
    const content: LocaleContent = {
      subject: "Quote valid until {{quote.validUntil}}",
      preheader: "",
      blocks: [
        {
          id: "total",
          type: "total",
          label: "Total",
          value: "{{quote.total}}",
          visibleIf: null,
        },
        {
          id: "lines",
          type: "list",
          source: "quote.lines",
          labelPath: "name",
          valuePath: "price",
          visibleIf: null,
        },
      ],
    };
    const email = resolveEmail(
      content,
      {
        quote: {
          validUntil: "2026-11-14",
          total: TOTAL,
          lines: [{ name: "Panels", price: { value: 50000, currency: "EUR" } }],
        },
      },
      "send",
      valueFormatOf("fr", DATE_VARIABLES),
    );
    expect(email.subject).to.equal("Quote valid until 14 novembre 2026");
    const [total, lines] = email.blocks;
    expect(total?.type === "total" && plain(total.value)).to.equal(
      "9 874,20 €",
    );
    expect(
      lines?.type === "list" && plain(lines.rows[0]?.value ?? ""),
    ).to.equal("500,00 €");
  });

  it("keeps interpolating without a format", () => {
    expect(interpolate("{{a}}", { a: "2026-11-14" }).text).to.equal(
      "2026-11-14",
    );
  });
});
