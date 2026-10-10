import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RealSendModal from '../app/components/RealSendModal.vue'
import RecipientsField from '../app/components/RecipientsField.vue'
import TestSendModal from '../app/components/TestSendModal.vue'
import type {
	TemplateContentResponse,
	TemplateStatus,
} from '../app/types/mailing'
import { defineComponent, h } from 'vue'
import {
	FORM_STUBS,
	flush,
	mount,
	slotStub,
	stubNuxtGlobals,
	typeInto,
	type NuxtStubs,
} from './helpers/nuxt-globals'

const api = {
	templateContent: vi.fn(),
	preview: vi.fn(),
	testSend: vi.fn(),
	realSend: vi.fn(),
}

vi.mock('../app/composables/useMailingApi', () => ({
	useMailingApi: () => api,
}))

const DRAFT_CONTENT = {
	locales: { en: { subject: 'Hi', preheader: '', blocks: [] } },
}
const PUBLISHED_CONTENT = {
	locales: {
		en: { subject: 'Hi', preheader: '', blocks: [] },
		fr: { subject: 'Salut', preheader: '', blocks: [] },
	},
}

function detail(status: TemplateStatus): TemplateContentResponse {
	return {
		template: {
			_id: 't1',
			slug: 'autumn-sale',
			name: 'Autumn sale',
			status,
			updatedAt: '2026-09-27T10:00:00Z',
			updatedBy: 'Hugo Bernard',
			publishedAt: '2026-09-22T10:00:00Z',
		},
		content: DRAFT_CONTENT,
		publishedContent: status === 'live' ? PUBLISHED_CONTENT : null,
		hasDraft: true,
		version: status === 'live' ? 4 : 0,
		changes: [],
		variables: [{ path: 'customer.firstName', type: 'string', required: true }],
		detectedVariables: ['customer.firstName'],
		testData: { customer: { firstName: 'Margaux' } },
		fallbackLocale: 'en',
		categories: [],
		sender: { name: 'Acme Supplies', email: 'hello@acme.com', replyTo: '' },
	}
}

interface ReviewItem {
	id: string
	value?: string
}

const KeyValueListStub = defineComponent({
	props: { items: { type: Array, default: () => [] } },
	setup:
		(props, { slots }) =>
		() =>
			h(
				'dl',
				{ 'data-review': '' },
				(props.items as ReviewItem[]).map((item) =>
					h(
						'dd',
						{ 'data-id': item.id },
						slots.value?.({ item, formatted: item.value ?? '' }),
					),
				),
			),
})

const globals = {
	...FORM_STUBS,
	MailingRecipientsField: RecipientsField,
	DmsKeyValueList: KeyValueListStub,
	DmsBanner: slotStub('DmsBanner'),
}

let stubs: NuxtStubs

beforeEach(() => {
	stubs = stubNuxtGlobals('camille@acme.com')
	api.preview.mockResolvedValue({
		html: '',
		subject: '20% off every chair',
		locale: 'en',
		missing: [],
		hiddenBlockIds: [],
	})
	api.testSend.mockResolvedValue({
		results: [{ sendId: 's1', status: 'sent' }],
	})
	api.realSend.mockResolvedValue({
		results: [
			{ sendId: 's1', status: 'sent' },
			{ sendId: 's2', status: 'failed', error: 'boom' },
		],
	})
})

afterEach(() => {
	vi.unstubAllGlobals()
	document.body.innerHTML = ''
})

const submitButton = (host: HTMLElement) =>
	host.querySelector('ubutton[type="submit"]') as HTMLElement

const isDisabled = (host: HTMLElement) =>
	submitButton(host).getAttribute('disabled') === 'true'

const submit = async (host: HTMLElement) => {
	;(host.querySelector('form') as HTMLFormElement).dispatchEvent(
		new Event('submit'),
	)
	await flush()
}

describe('TestSendModal', () => {
	it('tests a draft too, prefilled with the current user', async () => {
		api.templateContent.mockResolvedValue(detail('draft'))
		const view = mount(TestSendModal, { templateId: 't1' }, globals)
		await flush()
		expect(
			view.host.querySelector('[data-tags]')?.getAttribute('data-tags'),
		).toBe('camille@acme.com')
		expect(view.host.textContent).toContain('1 / 5')
		expect(isDisabled(view.host)).toBe(false)
		await submit(view.host)
		expect(api.testSend).toHaveBeenCalledWith('t1', {
			to: ['camille@acme.com'],
			locale: 'en',
			content: DRAFT_CONTENT,
			data: { customer: { firstName: 'Margaux' } },
		})
		expect(stubs.toasts.at(-1)?.color).toBe('success')
		view.unmount()
	})

	it('sends the editor draft and data when the editor hands them over', async () => {
		api.templateContent.mockResolvedValue(detail('live'))
		const content = {
			locales: { fr: { subject: 'x', preheader: '', blocks: [] } },
		}
		const view = mount(
			TestSendModal,
			{ templateId: 't1', locale: 'fr', content, data: { a: 1 } },
			globals,
		)
		await flush()
		await submit(view.host)
		expect(api.testSend).toHaveBeenCalledWith(
			't1',
			expect.objectContaining({ content, locale: 'fr', data: { a: 1 } }),
		)
		view.unmount()
	})

	it('refuses an invalid address before sending', async () => {
		api.templateContent.mockResolvedValue(detail('draft'))
		const view = mount(TestSendModal, { templateId: 't1' }, globals)
		await flush()
		await typeInto(view.host.querySelector('[data-tags]')!, 'not-an-address')
		expect(isDisabled(view.host)).toBe(true)
		view.unmount()
	})
})

describe('RealSendModal', () => {
	it('stays disabled until the acknowledgement is ticked', async () => {
		api.templateContent.mockResolvedValue(detail('live'))
		const view = mount(RealSendModal, { templateId: 't1' }, globals)
		await flush()
		expect(
			view.host.querySelector('[data-tags]')?.getAttribute('data-tags'),
		).toBe('')
		await typeInto(
			view.host.querySelector('[data-tags]')!,
			'margaux@northwind.co',
		)
		expect(isDisabled(view.host)).toBe(true)
		const ack = view.host.querySelector(
			'input[type="checkbox"]',
		) as HTMLInputElement
		ack.checked = true
		ack.dispatchEvent(new Event('change'))
		await flush()
		expect(isDisabled(view.host)).toBe(false)
		await submit(view.host)
		expect(api.realSend).toHaveBeenCalledWith('t1', {
			to: ['margaux@northwind.co'],
			locale: 'en',
			data: undefined,
		})
		expect(stubs.toasts.map((toast) => toast.color)).toEqual([
			'error',
			'success',
		])
		view.unmount()
	})

	it('reviews the published subject, sender and version', async () => {
		api.templateContent.mockResolvedValue(detail('live'))
		const view = mount(RealSendModal, { templateId: 't1' }, globals)
		await flush()
		expect(api.preview).toHaveBeenCalledWith('t1', {
			locale: 'en',
			version: 'published',
		})
		const value = (id: string) =>
			view.host
				.querySelector(`[data-review] [data-id="${id}"]`)
				?.textContent?.trim()
		expect(value('from')).toBe('Acme Supplies <hello@acme.com>')
		expect(value('subject')).toBe('20% off every chair')
		expect(value('version')).toContain('v4')
		expect(value('version')).toContain('fr')
		expect(value('data')).toBe('dms_mailing.real_send.data_names')
		view.unmount()
	})

	it('untick the acknowledgement when the recipients change', async () => {
		api.templateContent.mockResolvedValue(detail('live'))
		const view = mount(RealSendModal, { templateId: 't1' }, globals)
		await flush()
		const tags = view.host.querySelector('[data-tags]')!
		await typeInto(tags, 'a@acme.com')
		const ack = view.host.querySelector(
			'input[type="checkbox"]',
		) as HTMLInputElement
		ack.checked = true
		ack.dispatchEvent(new Event('change'))
		await flush()
		await typeInto(view.host.querySelector('[data-tags]')!, 'b@acme.com')
		expect(isDisabled(view.host)).toBe(true)
		view.unmount()
	})

	it('refuses a draft with its checklist and a way out', async () => {
		api.templateContent.mockResolvedValue(detail('draft'))
		const view = mount(RealSendModal, { templateId: 't1' }, globals)
		await flush()
		expect(view.host.querySelector('form')).toBeNull()
		const checks = view.host.querySelector('dmschecklist')
		expect(checks).not.toBeNull()
		const buttons = [...view.host.querySelectorAll('ubutton')] as HTMLElement[]
		buttons[0]!.click()
		expect(stubs.modalCalls[0]?.component).toEqual({
			name: 'MailingTestSendModal',
		})
		buttons[1]!.click()
		await flush()
		expect(stubs.navigations).toEqual([
			{ path: '/modules/mailing/templates/t1', query: {} },
		])
		view.unmount()
	})
})
