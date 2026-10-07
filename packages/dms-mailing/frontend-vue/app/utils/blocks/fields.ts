import type { BlockType } from '../../types/mailing'

/**
 * `tokens` multi-line text with `{{` autocomplete, `token` the one-line
 * version, `text` plain text, `path` a variable path, `align` the alignment
 * switch, `size` the heading size slider.
 */
export type FieldKind = 'tokens' | 'token' | 'text' | 'path' | 'align' | 'size'

export interface BlockField {
	key: string
	kind: FieldKind
	label: string
	help?: string
}

const LABEL_PREFIX = 'dms_mailing.editor.block_settings'

const snakeCase = (key: string): string =>
	key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)

const field = (key: string, kind: FieldKind, help?: string): BlockField => ({
	key,
	kind,
	label: `${LABEL_PREFIX}.${snakeCase(key)}`,
	help,
})

const FIELDS: Record<BlockType, BlockField[]> = {
	hero: [field('imageUrl', 'token'), field('alt', 'token')],
	heading: [
		field('text', 'tokens'),
		field('align', 'align'),
		field('size', 'size'),
	],
	paragraph: [field('text', 'tokens'), field('align', 'align')],
	code: [field('text', 'token')],
	list: [
		field('source', 'path', 'source_help'),
		field('labelPath', 'text'),
		field('valuePath', 'text'),
	],
	total: [field('label', 'token'), field('value', 'token')],
	button: [
		field('text', 'token'),
		field('href', 'token'),
		field('align', 'align'),
	],
	if: [],
	divider: [],
	footer: [
		field('text', 'tokens'),
		field('unsubscribeLabel', 'text'),
		field('preferencesLabel', 'text'),
	],
}

export function fieldsFor(type: BlockType): BlockField[] {
	return FIELDS[type]
}
