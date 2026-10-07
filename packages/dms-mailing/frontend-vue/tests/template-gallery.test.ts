import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TemplateGallery from '../app/components/TemplateGallery.vue'
import TemplateCard from '../app/components/TemplateCard.vue'
import type { TemplateRow, TemplateStats } from '../app/types/mailing'
import {
	flush,
	mount,
	slotStub,
	stubNuxtGlobals,
	type NuxtStubs,
} from './helpers/nuxt-globals'

const api = {
	listCategories: vi.fn(),
	templatesOverview: vi.fn(),
	listTemplates: vi.fn(),
}

vi.mock('../app/composables/useMailingApi', () => ({
	useMailingApi: () => api,
}))

const RECENT = new Date(Date.now() - 3_600_000).toISOString()

function row(overrides: Partial<TemplateRow>): TemplateRow {
	return {
		_id: 'id',
		slug: 'slug',
		name: 'Name',
		category: 'orders',
		status: 'live',
		locales: 'en,fr,de',
		updatedAt: RECENT,
		updatedBy: 'Julie Martin',
		publishedVersion: 2,
		publishedAt: RECENT,
		...overrides,
	}
}

const LIVE = row({
	_id: 'live',
	name: 'Order confirmation',
	slug: 'order-confirmed',
})
const MISSING_DE = row({
	_id: 'missing',
	name: 'Shipping update',
	locales: 'en,fr',
})
const DRAFT = row({
	_id: 'draft',
	name: 'Delivery delayed',
	status: 'draft',
	publishedVersion: 0,
	category: 'billing',
})

const stats = (id: string, sends: number): TemplateStats => ({
	id,
	slug: id,
	sends,
	openRate: 71.9,
	problems: 0,
	lastSentAt: null,
})

interface ContextOptions {
	items: TemplateRow[]
	query?: Record<string, unknown>
}

function context({ items, query = {} }: ContextOptions) {
	return {
		items,
		loading: false,
		query,
		pagination: {
			pageIndex: 0,
			pageSize: 50,
			total: items.length,
			setPage: vi.fn(),
		},
		actions: { open: vi.fn() },
		refresh: vi.fn(),
		table: { setGlobalFilter: vi.fn() },
	}
}

const globals = {
	MailingTemplateCard: TemplateCard,
	MailingTemplatePreviewFrame: slotStub('MailingTemplatePreviewFrame'),
	MailingStarterGallery: slotStub('MailingStarterGallery'),
	DmsEmptyState: slotStub('DmsEmptyState'),
}

let stubs: NuxtStubs

beforeEach(() => {
	stubs = stubNuxtGlobals()
	api.listCategories.mockResolvedValue({
		categories: [
			{ id: 'orders', label: 'Orders', icon: 'i-ph-package' },
			{ id: 'billing', label: 'Billing', icon: 'i-ph-file-text' },
		],
	})
	api.templatesOverview.mockResolvedValue({
		items: [stats('live', 6812), stats('missing', 12)],
	})
	api.listTemplates.mockResolvedValue({ results: [], total: 3 })
})

afterEach(() => {
	vi.unstubAllGlobals()
	document.body.innerHTML = ''
})

const cardNames = (host: HTMLElement) =>
	[...host.querySelectorAll('h3')].map((title) => title.textContent?.trim())

describe('TemplateGallery', () => {
	it('groups the cards by category, in the settings order', async () => {
		const view = mount(
			TemplateGallery,
			{ context: context({ items: [DRAFT, LIVE, MISSING_DE] }) },
			globals,
		)
		await flush()
		const headings = [...view.host.querySelectorAll('h2')].map((h) =>
			h.textContent?.trim(),
		)
		expect(headings).toEqual(['Orders', 'Billing'])
		expect(cardNames(view.host)).toEqual([
			'Order confirmation',
			'Shipping update',
			'Delivery delayed',
		])
		view.unmount()
	})

	it('draws the 30-day figures and the attention badges on the cards', async () => {
		const view = mount(
			TemplateGallery,
			{ context: context({ items: [LIVE, DRAFT] }) },
			globals,
		)
		await flush()
		const text = view.host.textContent ?? ''
		expect(text).toContain('6,812')
		expect(text).toContain('dms_mailing.templates.card.edited_by')
		expect(text).toContain('name=Julie')
		view.unmount()
	})

	it('filters the cards that need attention from the chip', async () => {
		const view = mount(
			TemplateGallery,
			{ context: context({ items: [LIVE, MISSING_DE, DRAFT] }) },
			globals,
		)
		await flush()
		const chip = view.host.querySelector('ubutton[aria-pressed]') as HTMLElement
		expect(chip.textContent).toContain('2')
		chip.click()
		await flush()
		expect(cardNames(view.host)).toEqual([
			'Shipping update',
			'Delivery delayed',
		])
		view.unmount()
	})

	it('shows the starters on a first run', async () => {
		api.listTemplates.mockResolvedValue({ results: [], total: 0 })
		const view = mount(
			TemplateGallery,
			{ context: context({ items: [] }) },
			globals,
		)
		await flush()
		expect(
			view.host.querySelector('[data-stub="MailingStarterGallery"]'),
		).not.toBeNull()
		view.unmount()
	})

	it('offers to reset a search with no match, and to create from it', async () => {
		const ctx = context({
			items: [],
			query: { search: 'Refund', filter_status: 'is_not:archived' },
		})
		const view = mount(TemplateGallery, { context: ctx }, globals)
		await flush()
		const empty = view.host.querySelector(
			'[data-stub="DmsEmptyState"]',
		) as HTMLElement
		expect(empty.getAttribute('title')).toContain('search=Refund')
		const buttons = [...empty.querySelectorAll('ubutton')] as HTMLElement[]
		buttons[0]!.click()
		expect(ctx.table.setGlobalFilter).toHaveBeenCalledWith('')
		expect(stubs.navigations).toEqual([])
		buttons[1]!.click()
		expect(stubs.modalCalls[0]?.componentOptions).toMatchObject({
			initialName: 'Refund',
		})
		view.unmount()
	})

	it('also leaves the page state behind when a quick filter narrows it', async () => {
		const ctx = context({ items: [], query: { filter_category: 'is:billing' } })
		const view = mount(TemplateGallery, { context: ctx }, globals)
		await flush()
		;(
			view.host.querySelector(
				'[data-stub="DmsEmptyState"] ubutton',
			) as HTMLElement
		).click()
		expect(stubs.navigations).toEqual([{ path: '/modules/mailing/templates' }])
		view.unmount()
	})

	it('opens the new template dialog on N, not while typing', async () => {
		const view = mount(
			TemplateGallery,
			{ context: context({ items: [LIVE] }) },
			globals,
		)
		await flush()
		const input = document.createElement('input')
		document.body.appendChild(input)
		input.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'n', bubbles: true }),
		)
		expect(stubs.modalCalls).toHaveLength(0)
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }))
		expect(stubs.modalCalls[0]?.component).toEqual({
			name: 'MailingNewTemplateModal',
		})
		view.unmount()
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }))
		expect(stubs.modalCalls).toHaveLength(1)
	})

	it('opens a focused card on Enter and tests it on T', async () => {
		const ctx = context({ items: [LIVE] })
		const view = mount(TemplateGallery, { context: ctx }, globals)
		await flush()
		const card = view.host.querySelector('dmscard') as HTMLElement
		card.dispatchEvent(
			new KeyboardEvent('keydown', { key: 't', bubbles: true }),
		)
		expect(stubs.modalCalls[0]?.component).toEqual({
			name: 'MailingTestSendModal',
		})
		card.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
		)
		expect(ctx.actions.open).toHaveBeenCalledWith(LIVE)
		view.unmount()
	})

	it('opens the editor on a missing locale chip', async () => {
		const view = mount(
			TemplateGallery,
			{ context: context({ items: [MISSING_DE] }) },
			globals,
		)
		await flush()
		const chips = [
			...view.host.querySelectorAll('button[aria-label]'),
		] as HTMLElement[]
		const missing = chips.find((chip) => chip.textContent?.trim() === 'de')!
		expect(missing.className).toContain('border-dashed')
		missing.click()
		expect(stubs.navigations).toEqual([
			{ path: '/modules/mailing/templates/missing', query: { locale: 'de' } },
		])
		view.unmount()
	})
})
