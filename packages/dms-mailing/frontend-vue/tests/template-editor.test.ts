import { describe, expect, it } from 'vitest'
import { createEditorState } from '../app/composables/useTemplateEditor'
import type { TemplateContent } from '../app/types/mailing'

const CONTENT: TemplateContent = {
	locales: {
		en: {
			subject: 'S',
			preheader: '',
			blocks: [
				{
					id: 'h1',
					type: 'heading',
					text: 'Hi',
					align: 'left',
					size: 23,
					visibleIf: null,
				},
			],
		},
	},
}

describe('editor state', () => {
	it('starts clean on the requested locale and tracks dirtiness', () => {
		const state = createEditorState(CONTENT, 'en', ['en', 'fr'])
		expect(state.locale).toBe('en')
		expect(state.dirty).toBe(0)
		state.updateBlock('h1', { text: 'Hello' })
		expect(state.dirty).toBe(1)
		expect(state.current?.blocks[0]).toMatchObject({ text: 'Hello' })
	})
	it('selects and deselects blocks and the subject', () => {
		const state = createEditorState(CONTENT, 'en', ['en'])
		state.select('h1')
		expect(state.selected?.id).toBe('h1')
		state.selectSubject()
		expect(state.selected).toBeNull()
		expect(state.subjectSelected).toBe(true)
	})
	it('reports missing locales and creates one from a source locale', () => {
		const state = createEditorState(CONTENT, 'fr', ['en', 'fr'])
		expect(state.current).toBeNull()
		expect(state.missingLocales).toEqual(['fr'])
		state.createLocale('fr', 'en')
		expect(state.current?.subject).toBe('S')
		expect(state.current?.blocks[0]?.id).not.toBe('h1')
	})
	it('removes a block by id and marks the state dirty', () => {
		const state = createEditorState(CONTENT, 'en', ['en'])
		state.removeBlockById('h1')
		expect(state.current?.blocks).toHaveLength(0)
		expect(state.dirty).toBe(1)
	})
	it('adds blocks at the end of a list, inside branches too, and resets on save', () => {
		const state = createEditorState(CONTENT, 'en', ['en'])
		const branch = state.addBlock('if')
		state.addBlock('paragraph', { parentId: branch.id, branch: 'children' })
		expect(state.current?.blocks.at(-1)?.type).toBe('if')
		const found = state.findBlock(branch.id)
		expect(found?.type === 'if' && found.children).toHaveLength(1)
		state.markSaved()
		expect(state.dirty).toBe(0)
	})
})
