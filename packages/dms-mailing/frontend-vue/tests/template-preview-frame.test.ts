// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TemplatePreviewFrame from '../app/components/TemplatePreviewFrame.vue'
import { flush, mount, stubNuxtGlobals } from './helpers/nuxt-globals'
import { stubApiData } from './helpers/api-data'

/** Past the frame's debounce before it reads. */
const DEBOUNCE_WAIT_MS = 400

const api = { preview: vi.fn() }

vi.mock('../app/composables/useMailingApi', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useMailingApi: () => api,
}))

const skeleton = (host: HTMLElement) => host.querySelector('uskeleton')
const placeholder = (host: HTMLElement) =>
	host.querySelector('[data-preview-placeholder]')
const fallback = (host: HTMLElement) =>
	host.querySelector('[data-preview-fallback]')

async function settle(): Promise<void> {
	await vi.advanceTimersByTimeAsync(DEBOUNCE_WAIT_MS)
	await flush()
}

beforeEach(() => {
	vi.useFakeTimers()
	stubNuxtGlobals()
	stubApiData()
	api.preview.mockReset()
})

afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
	document.body.innerHTML = ''
})

describe('TemplatePreviewFrame', () => {
	it('holds a skeleton from its first render until the HTML is in', async () => {
		api.preview.mockResolvedValue({ html: '<p>Hello</p>' })
		const view = mount(TemplatePreviewFrame, { templateId: 't1', width: 600 })
		expect(skeleton(view.host)).not.toBeNull()
		expect(view.host.querySelector('iframe')).toBeNull()
		await settle()
		expect(skeleton(view.host)).toBeNull()
		expect(view.host.querySelector('iframe')?.getAttribute('srcdoc')).toContain(
			'Hello',
		)
		view.unmount()
	})

	it('waits on a blank sheet, never a skeleton, as a lazy thumbnail', async () => {
		api.preview.mockResolvedValue({ html: '<p>Hello</p>' })
		const view = mount(TemplatePreviewFrame, {
			templateId: 't1',
			width: 600,
			lazy: true,
		})
		await settle()
		expect(skeleton(view.host)).toBeNull()
		expect(placeholder(view.host)).not.toBeNull()
		expect(view.host.querySelector('iframe')).toBeNull()
		view.unmount()
	})

	it('shows its fallback when the preview cannot be read, not a skeleton for ever', async () => {
		api.preview.mockRejectedValue(new Error('500'))
		const view = mount(TemplatePreviewFrame, { templateId: 't1', width: 600 })
		await settle()
		expect(skeleton(view.host)).toBeNull()
		expect(fallback(view.host)?.textContent).toContain(
			'dms_mailing.common.preview_unavailable',
		)
		view.unmount()
	})

	it('keeps the box its size while it waits', () => {
		const view = mount(TemplatePreviewFrame, {
			templateId: 't1',
			width: 600,
			scale: 0.4,
			lazy: true,
		})
		const box = view.host.firstElementChild as HTMLElement
		expect(box.style.width).toBe('240px')
		expect(box.style.height).toBe('192px')
		view.unmount()
	})
})
