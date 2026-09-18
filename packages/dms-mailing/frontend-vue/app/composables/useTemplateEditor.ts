import { computed, reactive, toRefs } from 'vue'
import type {
	Block,
	BlockType,
	LocaleContent,
	TemplateContent,
} from '../types/mailing'
import {
	cloneWithNewIds,
	createBlock,
	findBlock,
	findParentList,
	removeBlock,
} from '../utils/blocks'
import { deepClone } from '../utils/clone'

export type IfBranch = 'children' | 'elseChildren'

export interface InsertTarget {
	parentId: string
	branch: IfBranch
}

export type RailTab = 'blocks' | 'settings' | 'template' | 'data'
export type EditorDevice = 'desktop' | 'mobile'
export type LocalePatch = Partial<Pick<LocaleContent, 'subject' | 'preheader'>>

interface EditorCore {
	content: TemplateContent
	locale: string
	locales: string[]
	dirty: number
	selectedId: string | null
	subjectSelected: boolean
	tab: RailTab
	device: EditorDevice
	previewMode: boolean
	railOpen: boolean
}

const emptyLocale = (): LocaleContent => ({
	subject: '',
	preheader: '',
	blocks: [],
})

function createCore(
	content: TemplateContent,
	locale: string,
	locales: string[],
): EditorCore {
	return reactive({
		content: deepClone(content),
		locale,
		locales,
		dirty: 0,
		selectedId: null,
		subjectSelected: false,
		tab: 'blocks',
		device: 'desktop',
		previewMode: false,
		railOpen: true,
	}) as EditorCore
}

function createViews(core: EditorCore) {
	const current = computed<LocaleContent | null>(
		() => core.content.locales[core.locale] ?? null,
	)
	return {
		current,
		selected: computed<Block | null>(() =>
			current.value && core.selectedId
				? findBlock(current.value.blocks, core.selectedId)
				: null,
		),
		missingLocales: computed(() =>
			core.locales.filter((code) => !core.content.locales[code]),
		),
	}
}

type EditorViews = ReturnType<typeof createViews>

function blocksOf(views: EditorViews): Block[] | null {
	return views.current.value?.blocks ?? null
}

function createSelectionActions(core: EditorCore) {
	function select(id: string | null): void {
		core.selectedId = id
		core.subjectSelected = false
		if (id) core.tab = 'settings'
	}
	function selectSubject(): void {
		core.selectedId = null
		core.subjectSelected = true
		core.tab = 'settings'
	}
	function setLocale(code: string): void {
		core.locale = code
		select(null)
	}
	return { select, selectSubject, setLocale }
}

interface MutationDeps {
	core: EditorCore
	views: EditorViews
	select: (id: string | null) => void
	touch: () => void
}

function listFor(views: EditorViews, target?: InsertTarget): Block[] | null {
	const blocks = blocksOf(views)
	if (!blocks) return null
	if (!target) return blocks
	const parent = findBlock(blocks, target.parentId)
	if (parent?.type !== 'if') return null
	if (target.branch === 'elseChildren' && !parent.elseChildren)
		parent.elseChildren = []
	return parent[target.branch]
}

function createBlockActions({ views, select, touch }: MutationDeps) {
	function updateBlock(id: string, patch: Partial<Block>): void {
		const blocks = blocksOf(views)
		const block = blocks ? findBlock(blocks, id) : null
		if (!block) return
		Object.assign(block, patch)
		touch()
	}
	function addBlock(
		type: BlockType,
		target?: InsertTarget,
		index?: number,
	): Block {
		const block = createBlock(type)
		const list = listFor(views, target)
		list?.splice(index ?? list.length, 0, block)
		select(block.id)
		touch()
		return block
	}
	function addElse(id: string): void {
		const blocks = blocksOf(views)
		const block = blocks ? findBlock(blocks, id) : null
		if (block?.type !== 'if' || block.elseChildren) return
		block.elseChildren = [createBlock('paragraph')]
		touch()
	}
	function removeElse(id: string): void {
		const blocks = blocksOf(views)
		const block = blocks ? findBlock(blocks, id) : null
		if (block?.type !== 'if') return
		block.elseChildren = null
		touch()
	}
	function removeBlockById(id: string): void {
		const blocks = blocksOf(views)
		if (blocks && removeBlock(blocks, id)) touch()
	}
	return {
		updateBlock,
		addBlock,
		addElse,
		removeElse,
		removeBlockById,
		findBlock: (id: string) => {
			const blocks = blocksOf(views)
			return blocks ? findBlock(blocks, id) : null
		},
		parentListOf: (id: string) => {
			const blocks = blocksOf(views)
			return blocks ? findParentList(blocks, id) : null
		},
		updateLocale: (patch: LocalePatch) => {
			if (!views.current.value) return
			Object.assign(views.current.value, patch)
			touch()
		},
	}
}

function createLifecycleActions({ core, select, touch }: MutationDeps) {
	function createLocale(code: string, from?: string): void {
		const source = from ? core.content.locales[from] : undefined
		core.content.locales[code] = source
			? { ...deepClone(source), blocks: source.blocks.map(cloneWithNewIds) }
			: emptyLocale()
		core.locale = code
		touch()
	}
	function markSaved(): void {
		core.dirty = 0
	}
	function reset(content: TemplateContent): void {
		core.content = deepClone(content)
		core.dirty = 0
		select(null)
	}
	return { createLocale, markSaved, reset, touch }
}

export function createEditorState(
	content: TemplateContent,
	locale: string,
	locales: string[],
) {
	const core = createCore(content, locale, locales)
	const views = createViews(core)
	const selection = createSelectionActions(core)
	const deps: MutationDeps = {
		core,
		views,
		select: selection.select,
		touch: () => (core.dirty += 1),
	}
	return reactive({
		...toRefs(core),
		...views,
		...selection,
		...createBlockActions(deps),
		...createLifecycleActions(deps),
	})
}

export type EditorState = ReturnType<typeof createEditorState>
