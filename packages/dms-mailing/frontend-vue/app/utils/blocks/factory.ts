import type { Block, BlockType } from '../../types/mailing'

export interface PaletteEntry {
	type: BlockType
	icon: string
}

export const BLOCK_PALETTE: PaletteEntry[] = [
	{ type: 'heading', icon: 'i-ph-text-h' },
	{ type: 'paragraph', icon: 'i-ph-text-align-left' },
	{ type: 'button', icon: 'i-ph-cursor-click' },
	{ type: 'hero', icon: 'i-ph-image' },
	{ type: 'list', icon: 'i-ph-table' },
	{ type: 'total', icon: 'i-ph-sigma' },
	{ type: 'code', icon: 'i-ph-lock-key' },
	{ type: 'divider', icon: 'i-ph-minus' },
	{ type: 'footer', icon: 'i-ph-list-dashes' },
]

export const LOGIC_PALETTE: PaletteEntry[] = [
	{ type: 'if', icon: 'i-ph-git-branch' },
]

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
