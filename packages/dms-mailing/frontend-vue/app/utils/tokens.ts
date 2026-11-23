import type { InjectionKey, Ref } from 'vue'
import { jsonText } from './guards'
import type { JsonObject, JsonValue } from './guards'
import { isPresent, readPath } from './paths'
import { splitTokens } from './token-segments'

export { splitRawSegments, splitTokens } from './token-segments'
export type { RawSegment, TextPart, TextPartKind } from './token-segments'

/** A token read against test data: its value when the data provides one. */
export interface ResolvedToken {
	isPresent: boolean
	text: string
}

/** The test data the paper renders tokens with; `null` shows the paths. */
export type TokenData = JsonObject | null

/**
 * Provided by the canvas in Data mode so every `MailingTokenText` on the paper
 * swaps its tokens for values without each block renderer passing data down.
 */
export const TOKEN_DATA_KEY: InjectionKey<Ref<TokenData>> = Symbol(
	'dms-mailing-token-data',
)

/**
 * How a token without a value prints, as the engine's interpolation modes:
 * `preview` keeps it visible, `send` blanks it as a real e-mail does.
 */
export type InterpolationMode = 'preview' | 'send'

const MISSING_TOKEN: Record<InterpolationMode, (path: string) => string> = {
	preview: (path) => `{{${path}}}`,
	send: () => '',
}

/**
 * A test value as the data holds it. Amounts and dates are written for the
 * recipient's locale by the engine alone (`src/engine/formats.ts`): the
 * preview and the sends show them formatted, the paper shows them raw.
 */
function formatValue(value: JsonValue): string {
	return jsonText(value)
}

/** Reads one token path in `data`, as the paper shows it. */
export function resolveToken(path: string, data: JsonObject): ResolvedToken {
	const value = readPath(data, path)
	return isPresent(value)
		? { isPresent: true, text: formatValue(value) }
		: { isPresent: false, text: path }
}

/** Replaces every token of `text` with its value, as the engine does. */
export function interpolateText(
	text: string,
	data: JsonObject,
	mode: InterpolationMode = 'preview',
): string {
	return splitTokens(text)
		.map((part) => {
			if (part.kind !== 'token') return part.value
			const resolved = resolveToken(part.value, data)
			return resolved.isPresent
				? resolved.text
				: MISSING_TOKEN[mode](part.value)
		})
		.join('')
}
