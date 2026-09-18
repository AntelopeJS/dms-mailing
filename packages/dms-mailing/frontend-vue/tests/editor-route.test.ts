import { describe, expect, it } from 'vitest'
import { EDITOR_PATH, editorRoute } from '../app/utils/editor-route'

describe('editorRoute', () => {
	it('targets the editor page with the template id', () => {
		expect(editorRoute('abc')).toEqual({
			path: EDITOR_PATH,
			query: { id: 'abc' },
		})
	})
	it('carries the locale when one is selected', () => {
		expect(editorRoute('abc', 'fr')).toEqual({
			path: '/modules/mailing/editor',
			query: { id: 'abc', locale: 'fr' },
		})
	})
	it('omits an empty locale rather than sending a blank query param', () => {
		expect(editorRoute('abc', '')).toEqual({
			path: EDITOR_PATH,
			query: { id: 'abc' },
		})
	})
})
