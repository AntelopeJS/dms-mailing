import type { Block, FooterBlock, IfBlock } from '../../app/types/mailing'

/** The block as a condition, or a thrown error when it is another kind. */
export function expectIf(block: Block | undefined): IfBlock {
	if (block?.type !== 'if') throw new Error('expected a condition block')
	return block
}

/** The block as a footer, or a thrown error when it is another kind. */
export function expectFooter(block: Block | undefined): FooterBlock {
	if (block?.type !== 'footer') throw new Error('expected a footer block')
	return block
}
