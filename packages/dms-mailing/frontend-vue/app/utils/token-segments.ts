/**
 * `token` is a `{{path}}` the engine fills in; `invalid` looks like one but
 * breaks its grammar, so the engine leaves it as typed.
 */
export type TextPartKind = 'text' | 'token' | 'invalid'

export interface TextPart {
	kind: TextPartKind
	value: string
}

/**
 * The engine's token grammar (`src/engine/tokens.ts` `TOKEN_PATTERN`), with
 * a capture around the whole token so `split` keeps it.
 */
const TOKEN_SPLIT = /(\{\{\s*[\w.[\]]+\s*\}\})/
const TOKEN_LIKE_SPLIT = /(\{\{[^}]*\}\})/
const TOKEN_MARKER_LENGTH = 2
const SPLIT_TOKEN_STEP = 2

/** A piece of text with tokens kept exactly as typed (spaces included). */
export interface RawSegment {
	kind: TextPartKind
	raw: string
	/** The trimmed path of a token; the raw text otherwise. */
	value: string
}

const isSplitMatch = (index: number): boolean => index % SPLIT_TOKEN_STEP === 1

function literalSegments(text: string): RawSegment[] {
	return text
		.split(TOKEN_LIKE_SPLIT)
		.map((raw, index) => ({
			kind: isSplitMatch(index) ? ('invalid' as const) : ('text' as const),
			raw,
			value: raw,
		}))
		.filter((segment) => segment.raw)
}

/**
 * Splits `text` into literal text, tokens and token look-alikes, keeping each
 * token's raw spelling: the token field's highlight layer must line up
 * character for character with the textarea.
 */
export function splitRawSegments(text: string): RawSegment[] {
	return text.split(TOKEN_SPLIT).flatMap((raw, index) =>
		isSplitMatch(index)
			? [
					{
						kind: 'token' as const,
						raw,
						value: raw.slice(TOKEN_MARKER_LENGTH, -TOKEN_MARKER_LENGTH).trim(),
					},
				]
			: literalSegments(raw),
	)
}

export function splitTokens(text: string): TextPart[] {
	return splitRawSegments(text).map(({ kind, value }) => ({ kind, value }))
}
