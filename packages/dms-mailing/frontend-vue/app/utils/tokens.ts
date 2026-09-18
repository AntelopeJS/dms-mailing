export type TextPartKind = 'text' | 'token'

export interface TextPart {
	kind: TextPartKind
	value: string
}

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
