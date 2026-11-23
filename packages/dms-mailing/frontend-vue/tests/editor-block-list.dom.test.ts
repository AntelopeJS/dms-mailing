import Sortable from 'sortablejs'
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
	type MockInstance,
} from 'vitest'
import {
	createApp,
	defineAsyncComponent,
	defineComponent,
	h,
	nextTick,
	reactive,
	type Component,
} from 'vue'
import EditorBlockList from '../app/components/editor/EditorBlockList.vue'
import { useEditorActions } from '../app/composables/useEditorActions'
import { provideEditorContext } from '../app/composables/useEditorContext'
import { useEditorSession } from '../app/composables/useEditorSession'
import { useMailingApi } from '../app/composables/useMailingApi'
import { useEditorReads } from '../app/composables/useMailingReads'
import {
	createEditorState,
	type EditorState,
} from '../app/composables/useTemplateEditor'
import type {
	Block,
	TemplateContent,
	TemplateContentResponse,
} from '../app/types/mailing'
import { stubApiData } from './helpers/api-data'
import { stubAuthFetch } from './helpers/auth-fetch'
import { query } from './helpers/narrow'
import { stubNuxtGlobals } from './helpers/nuxt-globals'
import { callHandler, dragEvent, pair } from './helpers/sortable-drag'

/**
 * The content every editor of the suite is built on.
 */
const CONTENT: TemplateContent = {
	locales: { en: { subject: 'Hi', preheader: '', blocks: [] } },
}

const LOADED: TemplateContentResponse = {
	template: {
		_id: 't1',
		slug: 'welcome',
		name: 'Welcome',
		status: 'draft',
		updatedAt: '2026-10-01T10:00:00Z',
		updatedBy: 'camille',
		attention: '',
	},
	content: CONTENT,
	publishedContent: null,
	hasDraft: true,
	version: 0,
	revision: 1,
	changes: [],
	variables: [],
	detectedVariables: [],
	testData: {},
	fallbackLocale: 'en',
	blockOnMissingVariables: false,
	categories: [],
	sender: { name: '', email: '', replyTo: '' },
}

/** A block renderer the DMS registers globally, still loading. */
const pending = () =>
	defineAsyncComponent(() => new Promise<Component>(() => {}))

/**
 * Renders `render` inside an editor built as the workspace builds it, and
 * hands the editor to `onEditor` before anything reads it.
 */
function inEditor(
	render: () => ReturnType<typeof h>[],
	onEditor: (editor: EditorState) => void = () => undefined,
): Component {
	return defineComponent({
		setup() {
			const editor = createEditorState(CONTENT, 'en', ['en'])
			onEditor(editor)
			const api = useMailingApi()
			const reads = useEditorReads('t1')
			const deps = { editor, api, reads, templateId: 't1', onError: () => {} }
			const session = useEditorSession({ ...deps, loaded: LOADED })
			const actions = useEditorActions({
				...deps,
				session,
				reload: async () => {},
			})
			provideEditorContext({ editor, session, actions, api, templateId: 't1' })
			return render
		},
	})
}

/** Each list in a `section` of its own, so its element can be found. */
function lists(...blocks: Block[][]): ReturnType<typeof h>[] {
	return blocks.map((list) => h('section', [h(EditorBlockList, { list })]))
}

/** The SortableJS instance VueUse created on each list element under `host`. */
function sortablesIn(host: HTMLElement): Sortable[] {
	return [...host.querySelectorAll('section')].map((section) => {
		const element = section.firstElementChild
		const sortable = element instanceof HTMLElement && Sortable.get(element)
		if (!sortable) throw new Error('no SortableJS instance on a list')
		return sortable
	})
}

beforeEach(() => {
	stubNuxtGlobals()
	stubApiData()
	stubAuthFetch()
})

afterEach(() => vi.unstubAllGlobals())

describe('editor draggable items', () => {
	it('mounts item elements before globally registered async blocks resolve', async () => {
		const list = reactive<Block[]>([
			{ id: 'first', type: 'divider', visibleIf: null },
			{ id: 'second', type: 'divider', visibleIf: null },
		])
		const errors: unknown[] = []
		const host = document.createElement('div')
		const app = createApp(inEditor(() => lists(list)))
		app.component('MailingEditorBlock', pending())
		app.component('MailingBlockDivider', pending())
		app.config.warnHandler = () => undefined
		app.config.errorHandler = (error) => errors.push(error)
		try {
			app.mount(host)
			await nextTick()
			expect(errors).toEqual([])
			expect(
				[...host.querySelectorAll('[data-drag-item] [data-block-id]')].map(
					(item) => item.getAttribute('data-block-id'),
				),
			).toEqual(['first', 'second'])
		} finally {
			app.unmount()
		}
	})
	it('selects a block dropped into the list', async () => {
		let touchSpy: MockInstance<EditorState['touch']> | undefined
		let selectSpy: MockInstance<EditorState['select']> | undefined
		const source = reactive<Block[]>([
			{ id: 'dropped', type: 'divider', visibleIf: null },
		])
		const target = reactive<Block[]>([])
		let editor: EditorState | undefined
		const app = createApp(
			inEditor(
				() => lists(source, target),
				(state) => {
					editor = state
					touchSpy = vi.spyOn(state, 'touch').mockImplementation(() => {})
					selectSpy = vi.spyOn(state, 'select')
				},
			),
		)
		app.config.warnHandler = () => undefined
		const host = document.createElement('div')
		app.mount(host)
		try {
			const [from, to] = pair(sortablesIn(host))
			expect(from.options).toMatchObject({
				group: { name: 'mailing-blocks' },
				handle: '.mailing-drag-handle',
				draggable: '>[data-drag-item]',
			})
			const item = query(from.el, '[data-drag-item]', HTMLElement)
			callHandler(from, 'onStart', dragEvent(item, { oldIndex: 0 }))
			to.el.prepend(item)
			callHandler(to, 'onAdd', dragEvent(item, { newIndex: 0 }))
			callHandler(from, 'onRemove', dragEvent(item, { oldIndex: 0 }))
			callHandler(from, 'onEnd', dragEvent(item))
			await nextTick()
			expect(source).toEqual([])
			expect(target.map((block) => block.id)).toEqual(['dropped'])
			expect(touchSpy).toHaveBeenCalledTimes(2)
			expect(selectSpy).toHaveBeenCalledExactlyOnceWith('dropped')
			expect(editor?.selectedId).toBe('dropped')
		} finally {
			app.unmount()
		}
	})
})
