import type { BlockType } from '../../types/mailing'

export type FieldKind = 'text' | 'textarea' | 'url' | 'align' | 'size'

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
	hero: [field('imageUrl', 'url'), field('alt', 'text')],
	heading: [
		field('text', 'textarea', 'insert_hint'),
		field('align', 'align'),
		field('size', 'size'),
	],
	paragraph: [
		field('text', 'textarea', 'insert_hint'),
		field('align', 'align'),
	],
	code: [field('text', 'text')],
	list: [
		field('source', 'text', 'source_help'),
		field('labelPath', 'text'),
		field('valuePath', 'text'),
	],
	total: [field('label', 'text'), field('value', 'text')],
	button: [
		field('text', 'text'),
		field('href', 'url'),
		field('align', 'align'),
	],
	if: [],
	divider: [],
	footer: [
		field('text', 'textarea'),
		field('unsubscribeLabel', 'text'),
		field('preferencesLabel', 'text'),
	],
}

export function fieldsFor(type: BlockType): BlockField[] {
	return FIELDS[type]
}
