import type { Block, BlockType } from '../../types/mailing'

export interface PaletteEntry {
	type: BlockType
	icon: string
	/** The tile spans both columns of the palette grid. */
	isWide?: boolean
}

/** The icon that stands for each block type, in the palette and the outline. */
export const BLOCK_ICONS: Record<BlockType, string> = {
	heading: 'i-ph-text-h',
	paragraph: 'i-ph-text-align-left',
	hero: 'i-ph-image',
	button: 'i-ph-cursor-click',
	list: 'i-ph-list-bullets',
	total: 'i-ph-receipt',
	code: 'i-ph-hash',
	divider: 'i-ph-minus',
	footer: 'i-ph-rows',
	if: 'i-ph-git-branch',
}

const entry = (type: BlockType, isWide = false): PaletteEntry => ({
	type,
	icon: BLOCK_ICONS[type],
	isWide,
})

export const BLOCK_PALETTE: PaletteEntry[] = [
	entry('heading'),
	entry('paragraph'),
	entry('hero'),
	entry('button'),
	entry('list'),
	entry('total'),
	entry('code'),
	entry('divider'),
	entry('footer', true),
]

export const LOGIC_PALETTE: PaletteEntry[] = [entry('if', true)]

const BLOCK_LABEL_PREFIX = 'dms_mailing.blocks'
const PALETTE_LABEL_PREFIX = 'dms_mailing.editor.palette.tiles'
const PALETTE_SPECIFIC_LABELS: BlockType[] = ['footer', 'if']

/** The i18n key naming a block type (outline, inspector, canvas tag). */
export function blockLabelKey(type: BlockType): string {
	return `${BLOCK_LABEL_PREFIX}.${type}`
}

/** The i18n key of a palette tile, longer than the block name for some. */
export function paletteLabelKey(type: BlockType): string {
	return PALETTE_SPECIFIC_LABELS.includes(type)
		? `${PALETTE_LABEL_PREFIX}.${type}`
		: blockLabelKey(type)
}

/** Keeps the tiles whose label or type contains `query`, case-insensitively. */
export function filterPalette(
	entries: PaletteEntry[],
	query: string,
	labelOf: (entry: PaletteEntry) => string,
): PaletteEntry[] {
	const needle = query.trim().toLowerCase()
	if (!needle) return entries
	return entries.filter(
		(candidate) =>
			labelOf(candidate).toLowerCase().includes(needle) ||
			candidate.type.includes(needle),
	)
}

const ID_RADIX = 36
const ID_LENGTH = 6
const ID_PADDING = '0'
const DEFAULT_HEADING_SIZE = 23

export function newBlockId(type: BlockType): string {
	const random = Math.random()
		.toString(ID_RADIX)
		.slice(2, 2 + ID_LENGTH)
	return `${type}_${random.padEnd(ID_LENGTH, ID_PADDING)}`
}

type BlockBuilder = (id: string) => Block

const BUILDERS: Record<BlockType, BlockBuilder> = {
	hero: (id) => ({ id, type: 'hero', imageUrl: '', alt: '', visibleIf: null }),
	heading: (id) => ({
		id,
		type: 'heading',
		text: 'New heading',
		align: 'left',
		size: DEFAULT_HEADING_SIZE,
		visibleIf: null,
	}),
	paragraph: (id) => ({
		id,
		type: 'paragraph',
		text: 'Paragraph text…',
		align: 'left',
		visibleIf: null,
	}),
	code: (id) => ({ id, type: 'code', text: '{{code}}', visibleIf: null }),
	list: (id) => ({
		id,
		type: 'list',
		source: 'order.lines',
		labelPath: 'label',
		valuePath: 'total',
		visibleIf: null,
	}),
	total: (id) => ({
		id,
		type: 'total',
		label: 'Total',
		value: '{{order.total}}',
		visibleIf: null,
	}),
	button: (id) => ({
		id,
		type: 'button',
		text: 'Button',
		href: 'https://',
		align: 'left',
		visibleIf: null,
	}),
	if: (id) => ({
		id,
		type: 'if',
		condition: { path: 'contact.isPro', operator: 'truthy', value: '' },
		children: [],
		elseChildren: null,
		visibleIf: null,
	}),
	divider: (id) => ({ id, type: 'divider', visibleIf: null }),
	footer: (id) => ({
		id,
		type: 'footer',
		text: '',
		unsubscribeLabel: 'Unsubscribe',
		preferencesLabel: 'Preferences',
		visibleIf: null,
	}),
}

export function createBlock(type: BlockType): Block {
	return BUILDERS[type](newBlockId(type))
}
