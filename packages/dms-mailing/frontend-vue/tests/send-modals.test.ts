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
	firstToastAction,
	flush,
	mount,
	slotStub,
	stubNuxtGlobals,
	typeInto,
	type NuxtStubs,
} from './helpers/nuxt-globals'
import { submitForm } from './helpers/dom'
import { expectDefined, query, queryAll } from './helpers/narrow'
import { mailingReads, stubApiData } from './helpers/api-data'
import { mailingWrites, stubAuthFetch } from './helpers/auth-fetch'

/** @vitest-environment jsdom */
const api = {
	templateContent: vi.fn(),
	preview: vi.fn(),
	testSend: vi.fn(),
	realSend: vi.fn(),
}

const DRAFT_CONTENT = {
	locales: { en: { subject: 'Hi', preheader: '', blocks: [] } },
}
const PUBLISHED_CONTENT = {
	locales: {
		en: { subject: 'Hi', preheader: '', blocks: [] },
		fr: { subject: 'Salut', preheader: '', blocks: [] },
	},
}

function detail(
	status: TemplateStatus,
	overrides: Partial<TemplateContentResponse> = {},
): TemplateContentResponse {
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
		...overrides,
	}
}

interface ReviewItem {
	id: string
	value?: string
}

interface ReviewListProps {
	items?: ReviewItem[]
}

const KeyValueListStub = defineComponent(
	(props: ReviewListProps, { slots }) =>
		() =>
			h(
				'dl',
				{ 'data-review': '' },
				(props.items ?? []).map((item) =>
					h(
						'dd',
						{ 'data-id': item.id },
						slots.value?.({ item, formatted: item.value ?? '' }),
					),
				),
			),
	{ props: { items: Array } },
)

const globals = {
	...FORM_STUBS,
	MailingRecipientsField: RecipientsField,
	DmsKeyValueList: KeyValueListStub,
	DmsNoticeBanner: slotStub('DmsNoticeBanner'),
}

let stubs: NuxtStubs

beforeEach(() => {
	stubs = stubNuxtGlobals('camille@acme.com')
	stubAuthFetch().respond(
		mailingWrites({
			preview: api.preview,
			testSend: api.testSend,
			realSend: api.realSend,
		}),
	)
	stubApiData().respond(
		mailingReads({ templateContent: api.templateContent }, ({ url }) => {
			throw new Error(`unexpected read ${url}`)
		}),
	)
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
	query(host, 'ubutton[type="submit"]', HTMLElement)

const tagsInput = (host: HTMLElement) =>
	query(host, '[data-tags]', HTMLInputElement)

const pathInput = (host: HTMLElement, path: string) =>
	query(host, `[data-path="${path}"]`, HTMLInputElement)

/** Ticks the acknowledgement the real send asks for. */
async function acknowledge(host: HTMLElement): Promise<void> {
	const ack = query(host, 'input[type="checkbox"]', HTMLInputElement)
	ack.checked = true
	ack.dispatchEvent(new Event('change'))
	await flush()
}

const isDisabled = (host: HTMLElement) =>
	submitButton(host).getAttribute('disabled') === 'true'

const submit = async (host: HTMLElement) => {
	submitForm(host)
	await flush()
}

describe('TestSendModal', () => {
	it('tests a draft too, prefilled with the current user', async () => {
		api.templateContent.mockResolvedValue(detail('draft', { hasDraft: false }))
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
			data: { customer: { firstName: 'Margaux' } },
		})
		expect(view.host.textContent).toContain(
			'dms_mailing.test_send.current_draft',
		)
		expect(stubs.toasts.at(-1)?.color).toBe('success')
		view.unmount()
	})

	it('tests the published version of a live template without a draft', async () => {
		api.templateContent.mockResolvedValue(detail('live', { hasDraft: false }))
		const view = mount(TestSendModal, { templateId: 't1' }, globals)
		await flush()
		expect(view.host.textContent).toContain(
			'dms_mailing.test_send.published_version version=4',
		)
		expect(view.host.querySelector('[data-version-choice]')).toBeNull()
		await submit(view.host)
		expect(api.testSend.mock.calls.at(-1)?.[1]).not.toHaveProperty('content')
		expect(api.testSend.mock.calls.at(-1)?.[1]).not.toHaveProperty('version')
		view.unmount()
	})

	it('offers the published version beside a saved draft', async () => {
		api.templateContent.mockResolvedValue(detail('live'))
		const view = mount(TestSendModal, { templateId: 't1' }, globals)
		await flush()
		expect(view.host.querySelector('[data-version-choice]')).not.toBeNull()
		await submit(view.host)
		expect(api.testSend.mock.calls.at(-1)?.[1]).not.toHaveProperty('content')
		view.unmount()
	})

	it('links the success toast to the send in the log', async () => {
		api.templateContent.mockResolvedValue(detail('draft'))
		const view = mount(TestSendModal, { templateId: 't1' }, globals)
		await flush()
		await submit(view.host)
		firstToastAction(stubs.toasts.at(-1)).onClick()
		expect(stubs.navigations.at(-1)).toEqual({
			path: '/modules/mailing/sends',
			query: { record: 's1' },
		})
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
		await typeInto(tagsInput(view.host), 'not-an-address')
		expect(isDisabled(view.host)).toBe(true)
		view.unmount()
	})
})

describe('RealSendModal acknowledgement', () => {
	it('stays disabled until the acknowledgement is ticked', async () => {
		api.templateContent.mockResolvedValue(detail('live'))
		const view = mount(RealSendModal, { templateId: 't1' }, globals)
		await flush()
		expect(
			view.host.querySelector('[data-tags]')?.getAttribute('data-tags'),
		).toBe('')
		await typeInto(tagsInput(view.host), 'margaux@northwind.co')
		expect(isDisabled(view.host)).toBe(true)
		await acknowledge(view.host)
		expect(isDisabled(view.host)).toBe(false)
		await submit(view.host)
		expect(api.realSend).toHaveBeenCalledWith('t1', {
			to: ['margaux@northwind.co'],
			locale: 'en',
			data: { customer: { firstName: 'Margaux' } },
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
			data: { customer: { firstName: 'Margaux' } },
		})
		const value = (id: string) =>
			view.host
				.querySelector(`[data-review] [data-id="${id}"]`)
				?.textContent?.trim()
		expect(value('from')).toBe('Acme Supplies <hello@acme.com>')
		expect(value('subject')).toBe('20% off every chair')
		expect(value('version')).toContain('v4')
		expect(value('version')).toContain('fr')
		expect(view.host.querySelector('[data-no-sender]')).toBeNull()
		view.unmount()
	})

	it('asks the values of the send and waits for the required ones', async () => {
		api.templateContent.mockResolvedValue(detail('live'))
		const view = mount(RealSendModal, { templateId: 't1' }, globals)
		await flush()
		const field = pathInput(view.host, 'customer.firstName')
		expect(field.value).toBe('Margaux')
		await typeInto(tagsInput(view.host), 'a@acme.com')
		await acknowledge(view.host)
		expect(isDisabled(view.host)).toBe(false)
		await typeInto(field, '')
		expect(isDisabled(view.host)).toBe(true)
		expect(
			view.host.querySelector('[data-missing-required]')?.textContent,
		).toContain('paths=customer.firstName')
		await typeInto(field, 'Julie')
		expect(isDisabled(view.host)).toBe(false)
		await submit(view.host)
		expect(api.realSend.mock.calls.at(-1)?.[1].data).toEqual({
			customer: { firstName: 'Julie' },
		})
		view.unmount()
	})
})

describe('RealSendModal values and review', () => {
	it('sends the typed child value when the content also prints its object', async () => {
		api.templateContent.mockResolvedValue(
			detail('live', {
				variables: [{ path: 'order.number', type: 'string', required: true }],
				detectedVariables: ['order', 'order.number', 'meta'],
				testData: { order: { number: 'A-42', total: 3 }, meta: { a: 1 } },
			}),
		)
		const view = mount(RealSendModal, { templateId: 't1' }, globals)
		await flush()
		const values = query(view.host, '[data-send-values]', HTMLElement)
		expect(values.textContent).not.toContain('list_missing')
		expect(values.textContent).toContain('dms_mailing.real_send.object_value')
		expect(view.host.querySelector('[data-path="order"]')).toBeNull()
		await typeInto(pathInput(view.host, 'order.number'), 'B-7')
		await typeInto(tagsInput(view.host), 'a@acme.com')
		await acknowledge(view.host)
		await submit(view.host)
		expect(api.realSend.mock.calls.at(-1)?.[1].data).toEqual({
			order: { number: 'B-7' },
			meta: { a: 1 },
		})
		view.unmount()
	})

	it('reviews the subject a recipient reads, blanks included', async () => {
		api.preview.mockResolvedValue({
			html: '',
			subject: 'Order {{order.number}} shipped',
			locale: 'en',
			missing: ['order.number'],
			hiddenBlockIds: [],
		})
		api.templateContent.mockResolvedValue(detail('live'))
		const view = mount(RealSendModal, { templateId: 't1' }, globals)
		await flush()
		expect(
			view.host
				.querySelector('[data-review] [data-id="subject"]')
				?.textContent?.trim(),
		).toBe('Order  shipped')
		view.unmount()
	})

	it('warns when no sender is set', async () => {
		api.templateContent.mockResolvedValue(
			detail('live', { sender: { name: '', email: '', replyTo: '' } }),
		)
		const view = mount(RealSendModal, { templateId: 't1' }, globals)
		await flush()
		expect(view.host.querySelector('[data-no-sender]')).not.toBeNull()
		view.unmount()
	})

	it('untick the acknowledgement when the recipients change', async () => {
		api.templateContent.mockResolvedValue(detail('live'))
		const view = mount(RealSendModal, { templateId: 't1' }, globals)
		await flush()
		await typeInto(tagsInput(view.host), 'a@acme.com')
		await acknowledge(view.host)
		await typeInto(tagsInput(view.host), 'b@acme.com')
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
		const buttons = queryAll(view.host, 'ubutton', HTMLElement)
		expectDefined(buttons[0]).click()
		expect(stubs.modalCalls[0]?.component).toEqual({
			name: 'MailingTestSendModal',
		})
		expectDefined(buttons[1]).click()
		await flush()
		expect(stubs.navigations).toEqual([
			{ path: '/modules/mailing/templates/t1', query: {} },
		])
		view.unmount()
	})
})
