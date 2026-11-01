// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import EditorWorkspace from '../app/components/editor/EditorWorkspace.vue'
import { useEditorContext } from '../app/composables/useEditorContext'
import type { TemplateContentResponse } from '../app/types/mailing'
import { flush, mount, stubNuxtGlobals } from './helpers/nuxt-globals'
import { stubApiData } from './helpers/api-data'
import { stubAuthFetch } from './helpers/auth-fetch'

const loaded: TemplateContentResponse = {
	template: { _id: 't1', slug: 'welcome', name: 'Welcome', status: 'archived' },
	content: { locales: { en: { subject: 'Hi', preheader: '', blocks: [] } } },
	publishedContent: null,
	hasDraft: false,
	version: 1,
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

afterEach(() => vi.unstubAllGlobals())

it.each([true, false])(
	'the shared editor presenter keeps only the owning notice for read-only mark %s',
	async (marked) => {
		const stubs = stubNuxtGlobals()
		stubApiData()
		vi.stubGlobal('useUnsavedChanges', () => undefined)
		const error = {
			response: new Response(null, {
				status: 403,
				headers: marked ? { 'x-dms-readonly': '1' } : {},
			}),
			data: 'Forbidden',
		}
		stubAuthFetch().respond(() => {
			globalThis.useReadOnlyRefusal()(error)
			return Promise.reject(error)
		})
		const toolbar = defineComponent({
			setup() {
				const { actions } = useEditorContext()
				return () =>
					h(
						'button',
						{ onClick: () => actions.runLifecycle('restore') },
						'Restore',
					)
			},
		})
		const view = mount(
			EditorWorkspace,
			{ loaded, templateId: 't1', reload: async () => undefined },
			{
				MailingEditorToolbar: toolbar,
			},
		)
		view.host.querySelector('button')!.click()
		await flush()
		expect(stubs.toasts).toEqual([
			marked
				? { title: 'Read-only demo, changes are not saved' }
				: { color: 'error', title: 'Forbidden' },
		])
		view.unmount()
	},
)
