/** Answers the text of an i18n key, or nothing when the catalog lacks it. */
export type OptionalTranslate = (key: string) => string | undefined

/** What marks a stored text as an i18n key, like every DMS display string. */
const I18N_KEY_PREFIX = '$'

export const isI18nKey = (text: string): boolean =>
	text.startsWith(I18N_KEY_PREFIX)

/**
 * A stored text as the interface shows it: a `$`-prefixed i18n key (what a
 * project declaring its templates from code may ship) read in the interface's
 * language, the bare key when the catalog lacks it; any other text as
 * written.
 */
export function displayText(
	text: string,
	translate: OptionalTranslate,
): string {
	if (!isI18nKey(text)) return text
	const key = text.slice(I18N_KEY_PREFIX.length)
	return translate(key) ?? key
}
