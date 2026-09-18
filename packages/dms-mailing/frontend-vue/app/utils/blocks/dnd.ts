import type { Block } from '../../types/mailing'
import type { PaletteEntry } from './factory'
import { createBlock } from './factory'

export const DRAG_GROUP = { name: 'mailing-blocks' }
export const PALETTE_GROUP = {
	name: 'mailing-blocks',
	pull: 'clone' as const,
	put: false,
}
export const DRAG_HANDLE = '.mailing-drag-handle'

export function cloneFromPalette(entry: PaletteEntry): Block {
	return createBlock(entry.type)
}
