// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SendDrawer from '../app/components/SendDrawer.vue'
import type { SendRow } from '../app/types/mailing'
import { flush, mount, slotStub, stubNuxtGlobals } from './helpers/nuxt-globals'
import { mailingReads, stubApiData } from './helpers/api-data'

vi.mock('../app/composables/useMailingApi', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useMailingApi: () => ({ replay: vi.fn() }),
}))

const SEND: SendRow = {
	_id: '041f125a00000000',
	templateId: 't1',
	templateSlug: 'invoice-reminder',
	locale: 'fr',
	templateVersion: 1,
	recipientEmail: 'marc@boulangerie-lejeune.example',
	recipientName: 'Marc Lejeune',
	status: 'sent',
	providerMessageId: '<f1c836b9-226e-1c5a-ab39-10b4beb00a4c@ethereal.email>',
	latencyMs: 822,
	source: 'automation.overdue-reminders',
	json_variables: '{"customer":{"name":"Marc"}}',
	opens: 0,
	clicks: 0,
	createdAt: '2026-10-20T08:00:02Z',
	isTest: false,
}

const STUB_NAMES = [
	'USkeleton',
	'UButton',
	'UIcon',
	'DmsEyebrow',
	'DmsStatusPill',
	'DmsStatGroup',
	'DmsBanner',
	'DmsActivityItem',
	'DmsListRow',
	'DmsKeyValueList',
]
const STUBS = Object.fromEntries(
	STUB_NAMES.map((name) => [name, slotStub(name)]),
)

async function render(): Promise<HTMLElement> {
	const { host } = mount(SendDrawer, { rowData: SEND }, STUBS)
	await flush()
	return host
}

describe('send drawer layout', () => {
	beforeEach(() => {
		stubNuxtGlobals()
		vi.stubGlobal('useApiError', () => undefined)
		stubApiData().respond(
			mailingReads({ send: () => ({ send: SEND, events: [] }) }),
		)
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		document.body.innerHTML = ''
	})

	it('adds no inset or scroller of its own inside the drawer body', async () => {
		const host = await render()
		const root = host.firstElementChild as HTMLElement
		expect(root.className).not.toMatch(/(^|\s)(p|px|py|m)-\d/)
		expect(root.className).not.toContain('h-full')
		expect(host.querySelector('.overflow-y-auto')).toBeNull()
		expect(host.querySelector('header')?.className).not.toMatch(/px-\d/)
	})

	it('sticks the actions to the bottom, aligned with the body', async () => {
		const footer = (await render()).querySelector('[data-send-footer]')
		expect(footer?.className).toContain('sticky')
		expect(footer?.className).toContain('bottom-[calc(var(--dms-form-foot-pb')
		expect(footer?.className).not.toMatch(/(^|\s)px-\d/)
	})

	it('keeps the template / locale / latency trio on one row in a 600px drawer', async () => {
		const group = (await render()).querySelector('[data-stub="DmsStatGroup"]')
		expect(group?.className).toContain('@md:[&>div]:grid-cols-3')
	})

	it('wraps the timeline so a Message-ID is never clipped', async () => {
		const items = (await render()).querySelectorAll(
			'[data-stub="DmsActivityItem"]',
		)
		expect(items.length).toBeGreaterThan(0)
		items.forEach((item) => expect(item.hasAttribute('wrap')).toBe(true))
	})

	it('lets the address give way before the date on a phone', async () => {
		const line = (await render()).querySelector('[data-send-recipient]')
		const [address, date] = Array.from(line?.children ?? [])
		expect(line?.className).toContain('flex-wrap')
		expect(line?.className).not.toContain('truncate')
		expect(address?.className).toContain('truncate')
		expect(address?.getAttribute('title')).toBe(SEND.recipientEmail)
		expect(date?.className).toContain('whitespace-nowrap')
	})

	it('puts the "source" label under the source, not beside it', async () => {
		const row = (await render()).querySelector('[data-send-source]')
		expect(row?.hasAttribute('trailing')).toBe(false)
		expect(row?.getAttribute('meta')).toContain('source')
		expect(row?.textContent).toContain(SEND.source)
	})
})
