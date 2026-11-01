// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import Editor from '../app/components/Editor.vue'
import RenderingModal from '../app/components/RenderingModal.vue'
import TemplatePreviewFrame from '../app/components/TemplatePreviewFrame.vue'
import EditorCompare from '../app/components/editor/EditorCompare.vue'
import { flush, mount, stubNuxtGlobals } from './helpers/nuxt-globals'
import { stubApiData } from './helpers/api-data'
import { stubAuthFetch } from './helpers/auth-fetch'

const CASES = [
	{ name: 'editor', component: Editor, props: { routeParams: { id: 't1' } } },
	{ name: 'rendering', component: RenderingModal, props: { sendId: 's1' } },
	{
		name: 'preview',
		component: TemplatePreviewFrame,
		props: { templateId: 't1' },
	},
	{
		name: 'compare',
		component: EditorCompare,
		props: { templateId: 't1', locale: 'en', content: { locales: {} } },
	},
]

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

it.each(CASES)(
	'$name hides only marked refusal errors and clears loading',
	async ({ component, props }) => {
		for (const marked of [true, false]) {
			vi.useFakeTimers()
			const stubs = stubNuxtGlobals()
			vi.stubGlobal('useDmsRoute', () => ({
				path: '/modules/mailing/templates/t1',
				query: {},
			}))
			vi.stubGlobal('useDmsState', () => ({ value: null }))
			vi.stubGlobal('useApiError', () => undefined)
			const error = {
				response: new Response(null, {
					status: 403,
					headers: marked ? { 'x-dms-readonly': '1' } : {},
				}),
			}
			const refuse = () => {
				globalThis.useReadOnlyRefusal()(error)
				return Promise.reject(error)
			}
			stubApiData().respond(refuse)
			stubAuthFetch().respond(refuse)
			const view = mount(component, props)
			await vi.advanceTimersByTimeAsync(400)
			await flush()
			expect(
				Boolean(
					view.host.querySelector('[variant="error"], [data-preview-fallback]'),
				),
			).toBe(!marked)
			expect(
				view.host.querySelector('uskeleton, mailingeditorloading'),
			).toBeNull()
			expect(stubs.toasts).toEqual(
				marked ? [{ title: 'Read-only demo, changes are not saved' }] : [],
			)
			view.unmount()
		}
	},
)
