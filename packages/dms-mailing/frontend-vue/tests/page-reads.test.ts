// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import ProviderPill from '../app/components/ProviderPill.vue'
import WebhookStatus from '../app/components/WebhookStatus.vue'
import type { WebhookStatus as Status } from '../app/utils/webhook-status'
import {
	stubApiData,
	stubRegionalFormat,
	type ApiDataStub,
} from './helpers/api-data'
import { flush, mount, slotStub, stubNuxtGlobals } from './helpers/nuxt-globals'

const api = { webhookTest: vi.fn() }

vi.mock('../app/composables/useMailingApi', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useMailingApi: () => api,
}))

const PROVIDER_URL = '/api/mailing/provider'
const STATUS_URL = '/api/mailing/settings/webhook-status'

const NEVER: Status = { lastReceived: null, lastRefused: null }
const TESTED: Status = {
	lastReceived: {
		at: new Date().toISOString(),
		provider: 'smtp',
		type: 'delivered',
		isMatched: false,
		isTest: true,
	},
	lastRefused: null,
}

const PillStub = defineComponent({
	props: { label: { type: String, default: '' } },
	setup: (props) => () => h('span', { 'data-pill': props.label }),
})

const PILL_GLOBALS = { DmsStatusPill: PillStub }

const ButtonStub = defineComponent({
	props: { label: { type: String, default: '' } },
	emits: ['click'],
	setup:
		(props, { emit }) =>
		() =>
			h('button', { onClick: () => emit('click') }, props.label),
})

let api$: ApiDataStub

beforeEach(() => {
	stubNuxtGlobals()
	stubRegionalFormat()
	vi.stubGlobal('resolveComponent', (name: string) => slotStub(name))
	vi.stubGlobal('useApiError', vi.fn())
	api$ = stubApiData()
	api.webhookTest.mockReset()
})

afterEach(() => {
	vi.unstubAllGlobals()
	document.body.innerHTML = ''
})

describe('ProviderPill', () => {
	it('names the provider read with the page', async () => {
		api$.respond(() => ({ name: 'smtp', connected: true, features: null }))
		const view = mount(ProviderPill, {}, PILL_GLOBALS)
		await flush()
		expect(api$.reads).toEqual([{ url: PROVIDER_URL, query: {} }])
		expect(
			view.host.querySelector('[data-pill]')?.getAttribute('data-pill'),
		).toBe('dms_mailing.page_header.provider_connected name=smtp')
		view.unmount()
	})

	it('says no provider when the read fails, and reads nothing when hidden', async () => {
		api$.respond(() => Promise.reject(new Error('503')))
		const failed = mount(ProviderPill, {}, PILL_GLOBALS)
		await flush()
		expect(
			failed.host.querySelector('[data-pill]')?.getAttribute('data-pill'),
		).toBe('dms_mailing.page_header.no_provider')
		failed.unmount()
		api$.reads.length = 0
		const hidden = mount(ProviderPill, { showProvider: false }, PILL_GLOBALS)
		await flush()
		expect(api$.reads).toEqual([])
		expect(hidden.host.querySelector('[data-pill]')).toBeNull()
		hidden.unmount()
	})
})

describe('WebhookStatus', () => {
	it('shows the status read, then the one a test event answers', async () => {
		api$.respond(() => NEVER)
		api.webhookTest.mockResolvedValue({
			isReceived: true,
			url: 'https://example.test/hook',
			durationMs: 12,
			status: TESTED,
		})
		const view = mount(
			WebhookStatus,
			{},
			{
				UButton: ButtonStub,
				UIcon: slotStub('UIcon'),
				USkeleton: slotStub('USkeleton'),
			},
		)
		await flush()
		expect(view.host.textContent).toContain(
			'dms_mailing.settings.webhook_status.never_received',
		)
		view.host.querySelector('button')?.click()
		await flush()
		expect(view.host.textContent).toContain(
			'dms_mailing.settings.webhook_status.received_test',
		)
		expect(api$.reads).toEqual([{ url: STATUS_URL, query: {} }])
		view.unmount()
	})

	it('says the status is unavailable when its read fails', async () => {
		api$.respond(() => Promise.reject(new Error('500')))
		const view = mount(
			WebhookStatus,
			{},
			{ UButton: ButtonStub, USkeleton: slotStub('USkeleton') },
		)
		await flush()
		expect(view.host.textContent).toContain(
			'dms_mailing.settings.webhook_status.unavailable',
		)
		view.unmount()
	})
})
