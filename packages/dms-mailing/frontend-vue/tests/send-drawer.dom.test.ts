import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SendDrawer from '../app/components/SendDrawer.vue'
import type { SendRow, SendStatus } from '../app/types/mailing'
import {
	flush,
	mount,
	slotStub,
	stubNuxtGlobals,
	type NuxtStubs,
} from './helpers/nuxt-globals'
import { mailingReads, stubApiData } from './helpers/api-data'
import { stubAuthFetch } from './helpers/auth-fetch'
import { elementAs, query } from './helpers/narrow'

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
	'DmsEyebrowLabel',
	'DmsStatusPill',
	'DmsStatGroup',
	'DmsNoticeBanner',
	'DmsActivityItem',
	'DmsListRow',
	'DmsKeyValueList',
	'DmsContainerFooter',
]
const STUBS = Object.fromEntries(
	STUB_NAMES.map((name) => [name, slotStub(name)]),
)

async function render(row: SendRow = SEND): Promise<HTMLElement> {
	const { host } = mount(SendDrawer, { rowData: row }, STUBS)
	await flush()
	return host
}

describe('send drawer layout', () => {
	beforeEach(() => {
		stubNuxtGlobals()
		stubAuthFetch()
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
		const root = elementAs(host.firstElementChild, HTMLElement)
		expect(root.className).not.toMatch(/(^|\s)(p|px|py|m)-\d/)
		expect(root.className).not.toContain('h-full')
		expect(host.querySelector('.overflow-y-auto')).toBeNull()
		expect(host.querySelector('header')?.className).not.toMatch(/px-\d/)
	})

	it('grows in the flex-column drawer body and puts its actions in the DMS footer, flush at the bottom', async () => {
		const host = await render()
		const root = elementAs(host.firstElementChild, HTMLElement)
		expect(root.className).toContain('flex-1')
		expect(root.className).toContain('flex-col')
		expect(root.style.minHeight).toBe('')
		const footer = host.querySelector('[data-send-footer]')
		expect(footer?.getAttribute('data-stub')).toBe('DmsContainerFooter')
		expect(
			footer?.querySelectorAll('[data-stub="UButton"]').length,
		).toBeGreaterThan(0)
	})

	it('keeps the template / locale / latency trio on one row in a 600px drawer', async () => {
		const group = (await render()).querySelector('[data-stub="DmsStatGroup"]')
		expect(group?.getAttribute('columns-from')).toBe('md')
		expect(group?.className).not.toContain('grid-cols')
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

	it('lists the files a send carried', async () => {
		const row: SendRow = {
			...SEND,
			json_attachments: JSON.stringify([
				{
					filename: 'invoice-001.pdf',
					contentType: 'application/pdf',
					size: 2048,
					sha256: 'a'.repeat(64),
				},
			]),
		}
		stubApiData().respond(
			mailingReads({ send: () => ({ send: row, events: [] }) }),
		)
		const host = await render(row)
		const listed = host.querySelector('[data-send-attachment]')
		expect(listed?.textContent).toContain('invoice-001.pdf')
		expect(listed?.getAttribute('meta')).toContain('2 kB')
	})

	it('shows no attachment section for a send without files', async () => {
		const host = await render()
		expect(host.querySelector('[data-send-attachment]')).toBeNull()
	})
})

describe('send drawer footer', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
		document.body.innerHTML = ''
	})

	async function openFrom(
		status: SendStatus,
		action: string,
	): Promise<NuxtStubs> {
		const row: SendRow = { ...SEND, status }
		const stubs = stubNuxtGlobals()
		stubAuthFetch()
		stubApiData().respond(
			mailingReads({ send: () => ({ send: row, events: [] }) }),
		)
		const host = await render(row)
		query(
			host,
			`[data-send-footer] [label="dms_mailing.sends.drawer.actions.${action}"]`,
			HTMLElement,
		).click()
		return stubs
	}

	it('opens the rendering of the send from View the e-mail', async () => {
		const stubs = await openFrom('sent', 'rendering')
		expect(stubs.modalCalls[0]?.component).toEqual({
			name: 'MailingRenderingModal',
		})
	})

	it('opens the corrected address dialog of a bounced send', async () => {
		const stubs = await openFrom('bounced', 'fix_address')
		expect(stubs.modalCalls[0]?.component).toEqual({
			name: 'MailingFixAddressModal',
		})
	})
})
