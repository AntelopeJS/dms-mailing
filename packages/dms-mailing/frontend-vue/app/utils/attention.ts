import type { AttentionTone } from '../types/mailing'

export interface CountedText {
	before: string
	count: string
	after: string
}

/** The well tone of an attention item; neutral items get the quiet well. */
export const ATTENTION_WELL_TONES: Record<
	AttentionTone,
	'warning' | 'error' | 'muted'
> = {
	warning: 'warning',
	error: 'error',
	neutral: 'muted',
}

const TRANSLATION_PREFIX = '$'

/** The i18n key a `$`-marked backend string holds; `null` for plain text. */
export function translationKeyOf(value: string): string | null {
	return value.startsWith(TRANSLATION_PREFIX)
		? value.slice(TRANSLATION_PREFIX.length)
		: null
}

/**
 * Splits a translated title around the figure it leads with, so the figure
 * can be set bold ("**3** sends failed today"). `null` when the text does not
 * contain it.
 */
export function splitCount(
	text: string,
	count: number | undefined,
	formatted: string,
): CountedText | null {
	if (count === undefined) return null
	const at = text.indexOf(formatted)
	if (at < 0) return null
	return {
		before: text.slice(0, at),
		count: formatted,
		after: text.slice(at + formatted.length),
	}
}
