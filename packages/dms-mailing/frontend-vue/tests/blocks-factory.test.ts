import { describe, expect, it } from 'vitest'
import {
	BLOCK_PALETTE,
	LOGIC_PALETTE,
	createBlock,
	newBlockId,
} from '../app/utils/blocks'

describe('block factory', () => {
	it('creates every palette block with a unique id and no visibility rule', () => {
		const ids = new Set<string>()
		for (const entry of [...BLOCK_PALETTE, ...LOGIC_PALETTE]) {
			const block = createBlock(entry.type)
			expect(block.type).toBe(entry.type)
			expect(block.visibleIf).toBeNull()
			expect(ids.has(block.id)).toBe(false)
			ids.add(block.id)
		}
	})
	it('gives an if block an empty then-branch and no else-branch', () => {
		const block = createBlock('if')
		expect(block.type === 'if' && block.children).toEqual([])
		expect(block.type === 'if' && block.elseChildren).toBeNull()
	})
	it('prefixes ids with the type', () => {
		expect(newBlockId('heading')).toMatch(/^heading_[a-z0-9]{6}$/)
	})
})
