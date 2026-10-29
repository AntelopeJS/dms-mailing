import type { VariableDefinition } from "../types";
import { isObject, isText } from "../validation/guards";

/**
 * An amount in the minor unit of its currency (cents for `EUR`), like the
 * DMS's composed-text `money` parameter: `{ value: 987420, currency: "EUR" }`
 * reads "€9,874.20" in English, "9 874,20 €" in French.
 */
export interface MoneyValue {
  value: number;
  /** ISO 4217 code. An unknown code writes the amount as a plain number. */
  currency: string;
}

/** How a send writes its typed values: its locale, and the paths typed `date`. */
export interface ValueFormat {
  locale: string;
  datePaths: Set<string>;
}

const FALLBACK_LOCALE = "en";
const DATE_STYLE: Intl.DateTimeFormatOptions = { dateStyle: "long" };
const UTC_DATE_STYLE: Intl.DateTimeFormatOptions = {
  ...DATE_STYLE,
  timeZone: "UTC",
};
/** A calendar day: written as that day, whatever the server's time zone. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A moment: written as its day in the server's time zone. */
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DECIMAL_BASE = 10;
const DATE_TYPE = "date";

/** `locale` when the runtime can format for it, English otherwise. */
export function formattingLocale(locale: string): string {
  try {
    return Intl.NumberFormat.supportedLocalesOf(locale)[0] ?? FALLBACK_LOCALE;
  } catch {
    return FALLBACK_LOCALE;
  }
}

/** The paths a template declares `date`: their ISO strings are written as dates. */
export function valueFormatOf(
  locale: string,
  variables: VariableDefinition[] = [],
): ValueFormat {
  return {
    locale: formattingLocale(locale),
    datePaths: new Set(
      variables
        .filter((variable) => variable.type === DATE_TYPE)
        .map((variable) => variable.path),
    ),
  };
}

export function isMoneyValue(value: unknown): value is MoneyValue {
  if (!isObject(value)) return false;
  return (
    typeof value.value === "number" &&
    Number.isFinite(value.value) &&
    typeof value.currency === "string"
  );
}

function formatMoney(money: MoneyValue, locale: string): string {
  try {
    const currency = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: money.currency,
    });
    const digits = currency.resolvedOptions().maximumFractionDigits ?? 0;
    return currency.format(money.value / DECIMAL_BASE ** digits);
  } catch {
    return new Intl.NumberFormat(locale).format(money.value);
  }
}

function formatDate(
  date: Date,
  options: Intl.DateTimeFormatOptions,
  locale: string,
): string {
  return new Intl.DateTimeFormat(locale, options).format(date);
}

function isoDateOptions(value: string): Intl.DateTimeFormatOptions | null {
  if (ISO_DAY.test(value)) return UTC_DATE_STYLE;
  if (ISO_DATE_TIME.test(value)) return DATE_STYLE;
  return null;
}

/** An ISO string at a `date` path as the date it names; `null` otherwise. */
function formatIsoDate(value: string, locale: string): string | null {
  const options = isoDateOptions(value);
  if (!options) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : formatDate(date, options, locale);
}

/**
 * A value as a recipient reads it. A money value and a `Date` format
 * themselves in the send's locale wherever they appear; an ISO string is
 * written as a date only at a path the template declares `date`; anything
 * else, a string already formatted by the caller among them, as given.
 */
export function formatValue(
  value: unknown,
  path = "",
  format?: ValueFormat,
): string {
  const locale = format?.locale ?? FALLBACK_LOCALE;
  if (isMoneyValue(value)) return formatMoney(value, locale);
  if (value instanceof Date)
    return Number.isNaN(value.getTime())
      ? String(value)
      : formatDate(value, DATE_STYLE, locale);
  if (isText(value) && format?.datePaths.has(path))
    return formatIsoDate(value, locale) ?? value;
  return String(value);
}
