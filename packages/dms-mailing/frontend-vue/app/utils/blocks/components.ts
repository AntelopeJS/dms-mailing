import type { BlockType } from '../../types/mailing'

export const BLOCK_COMPONENT_NAMES: Record<BlockType, string> = {
	hero: 'DmsMailingBlockHero',
	heading: 'DmsMailingBlockHeading',
	paragraph: 'DmsMailingBlockParagraph',
	code: 'DmsMailingBlockCode',
	list: 'DmsMailingBlockList',
	total: 'DmsMailingBlockTotal',
	button: 'DmsMailingBlockButton',
	if: 'DmsMailingEditorIfBlock',
	divider: 'DmsMailingBlockDivider',
	footer: 'DmsMailingBlockFooter',
}
