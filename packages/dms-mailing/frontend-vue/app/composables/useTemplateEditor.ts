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
	duplicateBlock,
	findBlock,
	findParentList,
	insertionAfter,
	moveBlock,
	removeBlock,
} from '../utils/blocks'
import { deepClone } from '../utils/clone'
import {
	createHistory,
	recordChange,
	redoChange,
	undoChange,
} from '../utils/history'
import type { EditorHistory } from '../utils/history'

export type IfBranch = 'children' | 'elseChildren'

export interface InsertTarget {
	parentId: string
	branch: IfBranch
}

export type LeftTab = 'blocks' | 'outline' | 'variables'
export type RightTab = 'block' | 'data' | 'template'
export type EditorDevice = 'desktop' | 'mobile'
export type PreviewMode = 'variables' | 'data'
export type LocalePatch = Partial<Pick<LocaleContent, 'subject' | 'preheader'>>

/** A clock, injectable so the history's coalescing is testable. */
export type EditorClock = () => number

interface EditorCore {
	content: TemplateContent
	locale: string
	locales: string[]
	revision: number
	savedRevision: number
	selectedId: string | null
	leftTab: LeftTab
	rightTab: RightTab
	device: EditorDevice
	previewMode: PreviewMode
	simulation: Record<string, boolean>
	isSearchRequested: boolean
	history: EditorHistory
}

const emptyLocale = (): LocaleContent => ({
	subject: '',
	preheader: '',
	blocks: [],
})

const snapshotOf = (content: TemplateContent): string => JSON.stringify(content)

function createCore(
	content: TemplateContent,
	locale: string,
	locales: string[],
): EditorCore {
	return reactive({
		content: deepClone(content),
		locale,
		locales,
		revision: 0,
		savedRevision: 0,
		selectedId: null,
		leftTab: 'blocks',
		rightTab: 'block',
		device: 'desktop',
		previewMode: 'variables',
		simulation: {},
		isSearchRequested: false,
		history: createHistory(snapshotOf(content)),
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
		dirty: computed(() => core.revision - core.savedRevision),
		canUndo: computed(() => core.history.past.length > 0),
		canRedo: computed(() => core.history.future.length > 0),
		isDataMode: computed(() => core.previewMode === 'data'),
	}
}

type EditorViews = ReturnType<typeof createViews>

interface MutationDeps {
	core: EditorCore
	views: EditorViews
	select: (id: string | null) => void
	touch: () => void
}

function blocksOf(views: EditorViews): Block[] | null {
	return views.current.value?.blocks ?? null
}

function createSelectionActions(core: EditorCore) {
	function select(id: string | null): void {
		core.selectedId = id
		if (id) core.rightTab = 'block'
	}
	return {
		select,
		setLocale(code: string): void {
			core.locale = code
			select(null)
		},
		requestSearch(): void {
			core.leftTab = 'blocks'
			core.isSearchRequested = true
		},
	}
}

function listFor(views: EditorViews, target?: InsertTarget): Block[] | null {
	const blocks = blocksOf(views)
	if (!blocks || !target) return blocks
	const parent = findBlock(blocks, target.parentId)
	if (parent?.type !== 'if') return null
	if (target.branch === 'elseChildren' && !parent.elseChildren)
		parent.elseChildren = []
	return parent[target.branch]
}

function createInsertActions({ views, select, touch, core }: MutationDeps) {
	function insertInto(list: Block[], index: number, type: BlockType): Block {
		const block = createBlock(type)
		list.splice(Math.min(index, list.length), 0, block)
		select(block.id)
		touch()
		return block
	}
	return {
		insertInto,
		addBlock(type: BlockType, target?: InsertTarget, index?: number): Block {
			const list = listFor(views, target) ?? []
			return insertInto(list, index ?? list.length, type)
		},
		addBlockUnderSelected(type: BlockType): Block | null {
			const blocks = blocksOf(views)
			if (!blocks) return null
			const point = insertionAfter(blocks, core.selectedId)
			return insertInto(point.list, point.index, type)
		},
	}
}

function createBlockActions({ views, select, touch, core }: MutationDeps) {
	const find = (id: string): Block | null => {
		const blocks = blocksOf(views)
		return blocks ? findBlock(blocks, id) : null
	}
	const mutateTree = (change: (blocks: Block[]) => unknown): void => {
		const blocks = blocksOf(views)
		if (blocks && change(blocks)) touch()
	}
	return {
		findBlock: find,
		parentListOf: (id: string) => {
			const blocks = blocksOf(views)
			return blocks ? findParentList(blocks, id) : null
		},
		updateBlock(id: string, patch: Partial<Block>): void {
			const block = find(id)
			if (!block) return
			Object.assign(block, patch)
			touch()
		},
		removeBlockById(id: string): void {
			if (core.selectedId === id) select(null)
			mutateTree((blocks) => removeBlock(blocks, id))
		},
		duplicateBlockById(id: string): void {
			mutateTree((blocks) => {
				const copy = duplicateBlock(blocks, id)
				if (copy) select(copy.id)
				return copy
			})
		},
		moveBlockById(id: string, direction: -1 | 1): void {
			mutateTree((blocks) => moveBlock(blocks, id, direction))
		},
	}
}

function createBranchActions({ views, touch }: MutationDeps) {
	const findIf = (id: string) => {
		const blocks = blocksOf(views)
		const block = blocks ? findBlock(blocks, id) : null
		return block?.type === 'if' ? block : null
	}
	return {
		setElse(id: string, isEnabled: boolean): void {
			const block = findIf(id)
			if (!block || Boolean(block.elseChildren) === isEnabled) return
			block.elseChildren = isEnabled ? [createBlock('paragraph')] : null
			touch()
		},
		updateLocale(patch: LocalePatch): void {
			if (!views.current.value) return
			Object.assign(views.current.value, patch)
			touch()
		},
	}
}

function createHistoryActions(
	core: EditorCore,
	select: (id: string | null) => void,
) {
	function restore(snapshot: string | null): void {
		if (snapshot === null) return
		core.content = JSON.parse(snapshot) as TemplateContent
		core.revision += 1
		const blocks = core.content.locales[core.locale]?.blocks ?? []
		if (core.selectedId && !findBlock(blocks, core.selectedId)) select(null)
	}
	return {
		undo: () => restore(undoChange(core.history)),
		redo: () => restore(redoChange(core.history)),
	}
}

function createLifecycleActions({ core, select, touch }: MutationDeps) {
	return {
		touch,
		createLocale(code: string, from?: string): void {
			const source = from ? core.content.locales[from] : undefined
			core.content.locales[code] = source
				? { ...deepClone(source), blocks: source.blocks.map(cloneWithNewIds) }
				: emptyLocale()
			core.locale = code
			touch()
		},
		/** Marks the content up to `revision` as saved (the latest by default). */
		markSaved(revision?: number): void {
			core.savedRevision = revision ?? core.revision
		},
		reset(content: TemplateContent): void {
			core.content = deepClone(content)
			core.history = createHistory(snapshotOf(content))
			core.savedRevision = core.revision
			select(null)
		},
	}
}

/**
 * The editor's state: the content being edited, the selection and panes, and
 * the history. Every mutation goes through `touch()`, which bumps the revision
 * autosave watches and records an undo step.
 */
export function createEditorState(
	content: TemplateContent,
	locale: string,
	locales: string[],
	clock: EditorClock = Date.now,
) {
	const core = createCore(content, locale, locales)
	const views = createViews(core)
	const selection = createSelectionActions(core)
	const touch = (): void => {
		core.revision += 1
		recordChange(core.history, snapshotOf(core.content), clock())
	}
	const deps: MutationDeps = { core, views, select: selection.select, touch }
	return reactive({
		...toRefs(core),
		...views,
		...selection,
		...createInsertActions(deps),
		...createBlockActions(deps),
		...createBranchActions(deps),
		...createHistoryActions(core, selection.select),
		...createLifecycleActions(deps),
	})
}

export type EditorState = ReturnType<typeof createEditorState>
