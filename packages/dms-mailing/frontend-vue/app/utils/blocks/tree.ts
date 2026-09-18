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
