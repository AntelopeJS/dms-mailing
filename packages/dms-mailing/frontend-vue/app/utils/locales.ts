export interface LocalePresence {
	code: string
	present: boolean
}

const LOCALE_LIST_SEPARATOR = ','

/** Reads the `locales` column, whose format is a comma-separated code list. */
export function parseLocaleList(value: string | undefined): string[] {
	return (value ?? '')
		.split(LOCALE_LIST_SEPARATOR)
		.map((code) => code.trim())
		.filter(Boolean)
}

/**
 * Coverage of `codes` (the locales the tenant offers, in its own order) by
 * `present` (the locales something actually has).
 */
export function localeCoverage(
	present: string[],
	codes: string[],
): LocalePresence[] {
	const owned = new Set(present)
	return codes.map((code) => ({ code, present: owned.has(code) }))
}

/**
 * Badge list for a template row. A row written before the `locales` column
 * existed carries no information, which is not the same as "no locale": it
 * answers an empty list so the card shows nothing rather than claiming every
 * locale is missing.
 */
export function localeBadges(
	stored: string | undefined,
	codes: string[],
): LocalePresence[] {
	const present = parseLocaleList(stored)
	if (!present.length) return []
	return localeCoverage(present, codes)
}
