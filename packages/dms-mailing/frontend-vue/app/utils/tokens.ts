import type { InjectionKey, Ref } from 'vue'
import { isPresent, readPath } from './paths'

export type TextPartKind = 'text' | 'token'

export interface TextPart {
	kind: TextPartKind
	value: string
}

/** A token read against test data: its value when the data provides one. */
export interface ResolvedToken {
	isPresent: boolean
	text: string
}

/** The test data the paper renders tokens with; `null` shows the paths. */
export type TokenData = Record<string, unknown> | null

/**
 * Provided by the canvas in Data mode so every `MailingTokenText` on the paper
 * swaps its tokens for values without each block renderer passing data down.
 */
export const TOKEN_DATA_KEY: InjectionKey<Ref<TokenData>> = Symbol(
	'dms-mailing-token-data',
)

const TOKEN_SPLIT = /(\{\{[^}]+\}\})/g
const TOKEN_OPEN = '{{'
const TOKEN_MARKER_LENGTH = 2

export function splitTokens(text: string): TextPart[] {
	return text
		.split(TOKEN_SPLIT)
		.filter(Boolean)
		.map((part) =>
			part.startsWith(TOKEN_OPEN)
				? {
						kind: 'token' as const,
						value: part.slice(TOKEN_MARKER_LENGTH, -TOKEN_MARKER_LENGTH).trim(),
					}
				: { kind: 'text' as const, value: part },
		)
}

function formatValue(value: unknown): string {
	return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/** Reads one token path in `data`, formatted like the engine prints it. */
export function resolveToken(
	path: string,
	data: Record<string, unknown>,
): ResolvedToken {
	const value = readPath(data, path)
	return isPresent(value)
		? { isPresent: true, text: formatValue(value) }
		: { isPresent: false, text: path }
}

/** Replaces every token of `text` with its value; missing ones stay as is. */
export function interpolateText(
	text: string,
	data: Record<string, unknown>,
): string {
	return splitTokens(text)
		.map((part) => {
			if (part.kind === 'text') return part.value
			const resolved = resolveToken(part.value, data)
			return resolved.isPresent ? resolved.text : `{{${part.value}}}`
		})
		.join('')
}

/** A piece of text with tokens kept exactly as typed (spaces included). */
export interface RawSegment {
	kind: TextPartKind
	raw: string
	/** The trimmed path of a token; the raw text otherwise. */
	value: string
}

/**
 * Like `splitTokens`, but keeps each token's raw spelling: the token field's
 * highlight layer must line up character for character with the textarea.
 */
export function splitRawSegments(text: string): RawSegment[] {
	return text
		.split(TOKEN_SPLIT)
		.filter(Boolean)
		.map((raw) =>
			raw.startsWith(TOKEN_OPEN)
				? {
						kind: 'token' as const,
						raw,
						value: raw.slice(TOKEN_MARKER_LENGTH, -TOKEN_MARKER_LENGTH).trim(),
					}
				: { kind: 'text' as const, raw, value: raw },
		)
}
