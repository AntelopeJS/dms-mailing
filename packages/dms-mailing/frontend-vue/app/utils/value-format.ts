import type { VariableDefinition } from '../types/mailing'

/**
 * How the engine writes typed values (`src/engine/formats.ts`), which the
 * layer cannot import: the editor's Data mode shows a money value or a date
 * the way the recipient will read it.
 */

/** An amount in the minor unit of its currency (cents for `EUR`). */
export interface MoneyValue {
	value: number
	currency: string
}

/** The locale values are written in, and the paths typed `date`. */
export interface ValueFormat {
	locale: string
	datePaths: Set<string>
}

const FALLBACK_LOCALE = 'en'
const DATE_STYLE: Intl.DateTimeFormatOptions = { dateStyle: 'long' }
const UTC_DATE_STYLE: Intl.DateTimeFormatOptions = {
	...DATE_STYLE,
	timeZone: 'UTC',
}
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const DECIMAL_BASE = 10
const DATE_TYPE = 'date'

function formattingLocale(locale: string): string {
	try {
		return Intl.NumberFormat.supportedLocalesOf(locale)[0] ?? FALLBACK_LOCALE
	} catch {
		return FALLBACK_LOCALE
	}
}

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
	}
}

function isMoneyValue(value: unknown): value is MoneyValue {
	if (!value || typeof value !== 'object') return false
	const candidate = value as Partial<MoneyValue>
	return (
		typeof candidate.value === 'number' &&
		Number.isFinite(candidate.value) &&
		typeof candidate.currency === 'string'
	)
}

function formatMoney(money: MoneyValue, locale: string): string {
	try {
		const currency = new Intl.NumberFormat(locale, {
			style: 'currency',
			currency: money.currency,
		})
		const digits = currency.resolvedOptions().maximumFractionDigits ?? 0
		return currency.format(money.value / DECIMAL_BASE ** digits)
	} catch {
		return new Intl.NumberFormat(locale).format(money.value)
	}
}

function formatDate(
	date: Date,
	options: Intl.DateTimeFormatOptions,
	locale: string,
): string {
	return new Intl.DateTimeFormat(locale, options).format(date)
}

function isoDateOptions(value: string): Intl.DateTimeFormatOptions | null {
	if (ISO_DAY.test(value)) return UTC_DATE_STYLE
	if (ISO_DATE_TIME.test(value)) return DATE_STYLE
	return null
}

function formatIsoDate(value: string, locale: string): string | null {
	const options = isoDateOptions(value)
	if (!options) return null
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? null : formatDate(date, options, locale)
}

/** A value as the recipient reads it, exactly like the engine writes it. */
export function formatValue(
	value: unknown,
	path = '',
	format?: ValueFormat,
): string {
	const locale = format?.locale ?? FALLBACK_LOCALE
	if (isMoneyValue(value)) return formatMoney(value, locale)
	if (value instanceof Date)
		return Number.isNaN(value.getTime())
			? String(value)
			: formatDate(value, DATE_STYLE, locale)
	if (typeof value === 'string' && format?.datePaths.has(path))
		return formatIsoDate(value, locale) ?? value
	return String(value)
}
