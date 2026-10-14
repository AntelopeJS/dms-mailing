// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	createApp,
	defineAsyncComponent,
	defineComponent,
	h,
	nextTick,
	reactive,
} from 'vue'
import EditorBlockList from '../app/components/editor/EditorBlockList.vue'
import type { Block } from '../app/types/mailing'

const editor = vi.hoisted(() => ({ touch: vi.fn(), select: vi.fn() }))

vi.mock('../app/composables/useEditorContext', () => ({
	useEditorContext: () => ({ editor }),
}))

vi.mock('../app/components/editor/EditorInsertPoint.vue', () => ({
	default: defineComponent({ setup: () => () => h('span') }),
}))

vi.mock('../app/components/editor/EditorBlock.vue', () => ({
	default: defineComponent({
		props: ['block'],
		setup: (props) => () => h('div', { 'data-block': props.block.id }),
	}),
}))

afterEach(() => vi.unstubAllGlobals())

describe('editor draggable items', () => {
	it('mounts item elements before globally registered async blocks resolve', async () => {
		vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
		const list = reactive<Block[]>([
			{ id: 'first', type: 'divider', visibleIf: null },
			{ id: 'second', type: 'divider', visibleIf: null },
		])
		const errors: unknown[] = []
		const host = document.createElement('div')
		const app = createApp(EditorBlockList, { list })
		app.component(
			'MailingEditorBlock',
			defineAsyncComponent(() => new Promise(() => {})),
		)
		app.config.errorHandler = (error) => errors.push(error)
		try {
			app.mount(host)
			await nextTick()
			expect(errors).toEqual([])
			expect(
				[...host.querySelectorAll('[data-block]')].map((item) =>
					item.getAttribute('data-block'),
				),
			).toEqual(['first', 'second'])
		} finally {
			app.unmount()
		}
	})
	it('selects a block dropped into the list', async () => {
		vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
		const list = reactive<Block[]>([])
		const app = createApp(EditorBlockList, { list })
		app.mount(document.createElement('div'))
		try {
			const draggable = app._instance?.subTree.props as Record<string, unknown>
			const onChange = draggable.onChange as (change: unknown) => void
			onChange({ added: { element: { id: 'dropped' }, newIndex: 0 } })
			onChange({ moved: { element: { id: 'other' } } })
			expect(editor.touch).toHaveBeenCalledTimes(2)
			expect(editor.select).toHaveBeenCalledExactlyOnceWith('dropped')
		} finally {
			app.unmount()
		}
	})
})
