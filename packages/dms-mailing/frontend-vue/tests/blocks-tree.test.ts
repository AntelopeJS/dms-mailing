import { describe, expect, it } from 'vitest'
import {
	createBlock,
	duplicateBlock,
	findBlock,
	findParentList,
	moveBlock,
	removeBlock,
} from '../app/utils/blocks'
import type { Block, IfBlock } from '../app/types/mailing'

function tree(): Block[] {
	const branch = createBlock('if') as IfBlock
	branch.id = 'if1'
	branch.children = [{ ...createBlock('paragraph'), id: 'p1' }]
	return [
		{ ...createBlock('heading'), id: 'h1' },
		branch,
		{ ...createBlock('footer'), id: 'f1' },
	]
}

describe('block tree', () => {
	it('finds nested blocks and their parent list', () => {
		const blocks = tree()
		expect(findBlock(blocks, 'p1')?.type).toBe('paragraph')
		expect(findParentList(blocks, 'p1')).toBe((blocks[1] as IfBlock).children)
		expect(findParentList(blocks, 'h1')).toBe(blocks)
		expect(findBlock(blocks, 'nope')).toBeNull()
	})
	it('moves within the parent list and clamps at the edges', () => {
		const blocks = tree()
		expect(moveBlock(blocks, 'f1', -1)).toBe(true)
		expect(blocks.map((block) => block.id)).toEqual(['h1', 'f1', 'if1'])
		expect(moveBlock(blocks, 'h1', -1)).toBe(false)
	})
	it('duplicates right after the source with fresh ids (deep)', () => {
		const blocks = tree()
		const copy = duplicateBlock(blocks, 'if1')
		expect(copy?.id).not.toBe('if1')
		expect(copy?.type === 'if' && copy.children[0]?.id).not.toBe('p1')
		expect(blocks[2]).toBe(copy)
	})
	it('removes nested blocks', () => {
		const blocks = tree()
		expect(removeBlock(blocks, 'p1')).toBe(true)
		expect((blocks[1] as IfBlock).children).toEqual([])
	})
})
