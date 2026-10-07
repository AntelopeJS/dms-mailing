import type { Block, IfBlock } from '../../types/mailing'
import { deepClone } from '../clone'
import { newBlockId } from './factory'

const isIf = (block: Block): block is IfBlock => block.type === 'if'

const branchesOf = (block: Block): Block[][] =>
	isIf(block)
		? [block.children, ...(block.elseChildren ? [block.elseChildren] : [])]
		: []

export function findParentList(blocks: Block[], id: string): Block[] | null {
	if (blocks.some((block) => block.id === id)) return blocks
	for (const block of blocks) {
		for (const branch of branchesOf(block)) {
			const found = findParentList(branch, id)
			if (found) return found
		}
	}
	return null
}

export function findBlock(blocks: Block[], id: string): Block | null {
	return findParentList(blocks, id)?.find((block) => block.id === id) ?? null
}

export function moveBlock(
	blocks: Block[],
	id: string,
	direction: -1 | 1,
): boolean {
	const list = findParentList(blocks, id)
	if (!list) return false
	const index = list.findIndex((block) => block.id === id)
	const target = index + direction
	if (target < 0 || target >= list.length) return false
	const [moved] = list.splice(index, 1)
	list.splice(target, 0, moved as Block)
	return true
}

export function cloneWithNewIds(block: Block): Block {
	const copy = deepClone(block)
	copy.id = newBlockId(copy.type)
	if (!isIf(copy)) return copy
	copy.children = copy.children.map(cloneWithNewIds)
	copy.elseChildren = copy.elseChildren
		? copy.elseChildren.map(cloneWithNewIds)
		: null
	return copy
}

export function duplicateBlock(blocks: Block[], id: string): Block | null {
	const list = findParentList(blocks, id)
	if (!list) return null
	const index = list.findIndex((block) => block.id === id)
	const copy = cloneWithNewIds(list[index] as Block)
	list.splice(index + 1, 0, copy)
	return copy
}

export function removeBlock(blocks: Block[], id: string): boolean {
	const list = findParentList(blocks, id)
	if (!list) return false
	list.splice(
		list.findIndex((block) => block.id === id),
		1,
	)
	return true
}

export function insertBlock(list: Block[], index: number, block: Block): void {
	list.splice(index, 0, block)
}

/** Every block of the tree, depth first, branches in place. */
export function flattenBlocks(blocks: Block[]): Block[] {
	return blocks.flatMap((block) => [
		block,
		...branchesOf(block).flatMap(flattenBlocks),
	])
}

/** Where a block sits in the whole tree, 1-based ("block 3 of 12"). */
export interface BlockPosition {
	index: number
	total: number
}

export function blockPosition(
	blocks: Block[],
	id: string,
): BlockPosition | null {
	const flat = flattenBlocks(blocks)
	const index = flat.findIndex((block) => block.id === id)
	return index < 0 ? null : { index: index + 1, total: flat.length }
}

/** A list of the tree and the index a new block goes to in it. */
export interface InsertionPoint {
	list: Block[]
	index: number
}

/**
 * Where a block added "under the selected one" lands: right after it in its
 * own list, or at the end of the root list when nothing is selected.
 */
export function insertionAfter(
	blocks: Block[],
	id: string | null,
): InsertionPoint {
	const list = id ? findParentList(blocks, id) : null
	if (!list) return { list: blocks, index: blocks.length }
	return { list, index: list.findIndex((block) => block.id === id) + 1 }
}

/** How many blocks each branch of a condition holds (then, else). */
export interface BranchCounts {
	then: number
	else: number | null
}

export function branchCounts(block: IfBlock): BranchCounts {
	return {
		then: block.children.length,
		else: block.elseChildren ? block.elseChildren.length : null,
	}
}
