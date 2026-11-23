import { reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TemplateGallery from '../app/components/TemplateGallery.vue'
import type { TemplateRow, TemplateStats } from '../app/types/mailing'
import {
	flush,
	mount,
	slotStub,
	stubNuxtGlobals,
	type NuxtStubs,
} from './helpers/nuxt-globals'

import {
	stubApiData,
	stubRegionalFormat,
	type ApiDataStub,
} from './helpers/api-data'
import { stubAuthFetch, type AuthFetchStub } from './helpers/auth-fetch'
import { elementWithAttribute } from './helpers/dom'
import { elementAs, expectDefined, query, queryAll } from './helpers/narrow'

const CATEGORIES_URL = '/api/mailing/templates/categories'
const OVERVIEW_URL = '/api/mailing/templates/overview'
const LIST_URL = '/api/mailing/tables/templates/list'

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
		attention: '',
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
	attention: 'missing_locale',
})
const DRAFT = row({
	_id: 'draft',
	name: 'Delivery delayed',
	status: 'draft',
	publishedVersion: 0,
	category: 'billing',
})
const STALE_DRAFT = row({
	_id: 'stale',
	name: 'Account closed',
	status: 'draft',
	publishedVersion: 0,
	category: 'billing',
	updatedAt: '2026-01-01T00:00:00Z',
	attention: 'stale_draft',
})
const stats = (id: string, sends: number): TemplateStats => ({
	id,
	slug: id,
	sends,
	openRate: 71.9,
	problems: 0,
	lastSentAt: null,
})

/** The query string of the page the gallery sits on. */
type RouteQuery = Record<string, string>

/** What the categories read answers. */
interface CategoriesAnswer {
	categories: { id: string; label: string; icon: string }[]
}

interface ContextOptions {
	items: TemplateRow[]
	query?: RouteQuery
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
	MailingStarterGallery: slotStub('MailingStarterGallery'),
	DmsEmptyState: slotStub('DmsEmptyState'),
}

let stubs: NuxtStubs
let writes: AuthFetchStub
let api: ApiDataStub
let routeQuery: RouteQuery = {}
let templateTotal = 3

const readsOf = (url: string) => api.reads.filter((read) => read.url === url)

beforeEach(() => {
	stubs = stubNuxtGlobals()
	stubRegionalFormat()
	writes = stubAuthFetch()
	routeQuery = {}
	templateTotal = 3
	vi.stubGlobal('useDmsRoute', () => ({ query: routeQuery }))
	api = stubApiData()
	api.respond(({ url }) => {
		if (url === CATEGORIES_URL)
			return {
				categories: [
					{ id: 'orders', label: 'Orders', icon: 'i-ph-package' },
					{ id: 'billing', label: 'Billing', icon: 'i-ph-file-text' },
				],
			}
		if (url === OVERVIEW_URL)
			return { items: [stats('live', 6812), stats('missing', 12)] }
		if (url === LIST_URL) return { results: [LIVE], total: templateTotal }
		throw new Error(`unexpected read ${url}`)
	})
})

afterEach(() => {
	vi.unstubAllGlobals()
	document.body.innerHTML = ''
})

const cardNames = (host: HTMLElement) =>
	[...host.querySelectorAll('h3')].map((title) => title.textContent?.trim())

describe('TemplateGallery cards', () => {
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
		expect(
			view.host.querySelectorAll('[data-preview-placeholder]'),
		).toHaveLength(3)
		expect(writes.calls).toEqual([])
		view.unmount()
	})

	it('draws the 30-day figures and the attention badges on the cards', async () => {
		const view = mount(
			TemplateGallery,
			{ context: context({ items: [LIVE, DRAFT, STALE_DRAFT] }) },
			globals,
		)
		await flush()
		const text = view.host.textContent ?? ''
		expect(text).toContain('6,812')
		expect(text).toContain('dms_mailing.templates.card.edited_by')
		expect(text).toContain('name=Julie')
		expect(
			view.host.querySelector(
				'[label*="dms_mailing.templates.card.stale_days"]',
			),
		).not.toBeNull()
		view.unmount()
	})

	it('lists the rows of the attention tab, and says when none is left', async () => {
		const query = { filter_needsAttention: 'is:true' }
		const listed = mount(
			TemplateGallery,
			{ context: context({ items: [MISSING_DE, STALE_DRAFT], query }) },
			globals,
		)
		await flush()
		expect(cardNames(listed.host)).toEqual([
			'Shipping update',
			'Account closed',
		])
		listed.unmount()
		const cleared = mount(
			TemplateGallery,
			{ context: context({ items: [], query }) },
			globals,
		)
		await flush()
		expect(
			cleared.host.querySelector(
				'[title*="dms_mailing.templates.attention.none_title"]',
			),
		).not.toBeNull()
		cleared.unmount()
	})

	it('reads the template count alone, not the rows', async () => {
		const view = mount(
			TemplateGallery,
			{ context: context({ items: [LIVE] }) },
			globals,
		)
		await flush()
		expect(readsOf(LIST_URL)).toEqual([
			{ url: LIST_URL, query: { limit: '1' } },
		])
		view.unmount()
	})

	it('reloads the figures when the table refreshes, not when it pages', async () => {
		const ctx = reactive(context({ items: [LIVE] }))
		const view = mount(TemplateGallery, { context: ctx }, globals)
		await flush()
		expect(readsOf(LIST_URL)).toHaveLength(1)
		ctx.items = [LIVE]
		await flush()
		expect(readsOf(LIST_URL)).toHaveLength(2)
		expect(readsOf(OVERVIEW_URL)).toHaveLength(2)
		ctx.pagination.pageIndex = 1
		ctx.items = [MISSING_DE]
		await flush()
		expect(readsOf(LIST_URL)).toHaveLength(2)
		view.unmount()
	})
})

describe('TemplateGallery sorting and empty states', () => {
	it('drops the category groups under an explicit sort, and steps the drawer in the drawn order', async () => {
		const ctx = context({
			items: [DRAFT, LIVE, MISSING_DE],
			query: { sortKey: 'name', sortDirection: 'asc' },
		})
		const view = mount(TemplateGallery, { context: ctx }, globals)
		await flush()
		expect(view.host.querySelectorAll('h2')).toHaveLength(0)
		expect(cardNames(view.host)).toEqual([
			'Delivery delayed',
			'Order confirmation',
			'Shipping update',
		])
		view.unmount()

		const grouped = mount(
			TemplateGallery,
			{ context: context({ items: [DRAFT, LIVE, MISSING_DE] }) },
			globals,
		)
		await flush()
		elementWithAttribute(
			grouped.host,
			'ubutton[aria-label]',
			'aria-label',
			'dms_mailing.templates.actions.details',
		).click()
		expect(expectDefined(stubs.drawerCalls[0]?.componentOptions)).toMatchObject(
			{ navigation: { index: 0, total: 3 } },
		)
		grouped.unmount()
	})

	it('shows the starters on a first run', async () => {
		templateTotal = 0
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
		const empty = query(view.host, '[data-stub="DmsEmptyState"]', HTMLElement)
		expect(empty.getAttribute('title')).toContain('search=Refund')
		const buttons = queryAll(empty, 'ubutton', HTMLElement)
		expectDefined(buttons[0]).click()
		expect(ctx.table.setGlobalFilter).toHaveBeenCalledWith('')
		expect(stubs.navigations).toEqual([])
		expectDefined(buttons[1]).click()
		expect(stubs.modalCalls[0]?.componentOptions).toMatchObject({
			initialName: 'Refund',
		})
		view.unmount()
	})

	it('also leaves the page state behind when a quick filter narrows it', async () => {
		const ctx = context({ items: [], query: { filter_category: 'is:billing' } })
		const view = mount(TemplateGallery, { context: ctx }, globals)
		await flush()
		query(view.host, '[data-stub="DmsEmptyState"] ubutton', HTMLElement).click()
		expect(stubs.navigations).toEqual([{ path: '/modules/mailing/templates' }])
		view.unmount()
	})
})

describe('TemplateGallery shortcuts', () => {
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
		const card = query(view.host, 'dmscardpanel', HTMLElement)
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
})

describe('TemplateGallery loading', () => {
	it('keeps its skeleton until the categories answered, then draws the cards in their group', async () => {
		let answerCategories: (value: CategoriesAnswer) => void = () => {}
		api.respond(({ url }) => {
			if (url === CATEGORIES_URL)
				return new Promise<CategoriesAnswer>(
					(resolve) => (answerCategories = resolve),
				)
			if (url === OVERVIEW_URL) return { items: [] }
			return { results: [LIVE], total: 1 }
		})
		const view = mount(
			TemplateGallery,
			{ context: context({ items: [LIVE] }) },
			globals,
		)
		await flush()
		expect(view.host.querySelector('[data-gallery-skeleton]')).not.toBeNull()
		expect(cardNames(view.host)).toEqual([])
		answerCategories({
			categories: [{ id: 'orders', label: 'Orders', icon: 'i-ph-package' }],
		})
		await flush()
		expect(view.host.querySelector('[data-gallery-skeleton]')).toBeNull()
		expect(view.host.querySelector('h2')?.textContent?.trim()).toBe('Orders')
		view.unmount()
	})

	it('draws no skeleton once the cards are on screen, a refresh included', async () => {
		const ctx = reactive(context({ items: [LIVE] }))
		const view = mount(TemplateGallery, { context: ctx }, globals)
		await flush()
		ctx.loading = true
		ctx.items = [LIVE]
		await flush()
		expect(view.host.querySelector('uskeleton')).toBeNull()
		expect(cardNames(view.host)).toEqual(['Order confirmation'])
		view.unmount()
	})

	it('lays its skeleton out like a group of cards, so they replace it in place', async () => {
		api.respond(({ url }) => {
			if (url === CATEGORIES_URL) return new Promise(() => {})
			return { items: [], results: [LIVE], total: 1 }
		})
		const loading = mount(
			TemplateGallery,
			{ context: context({ items: [LIVE] }) },
			globals,
		)
		await flush()
		const skeleton = query(loading.host, '[data-gallery-skeleton]', HTMLElement)
		const skeletonCard = query(skeleton, 'dmscardpanel', HTMLElement)
		const skeletonHeading = elementAs(skeleton.firstElementChild, HTMLElement)
		const skeletonBody = elementAs(skeletonCard.lastElementChild, HTMLElement)

		api.respond(({ url }) =>
			url === CATEGORIES_URL
				? { categories: [] }
				: { items: [], results: [LIVE], total: 1 },
		)
		const loaded = mount(
			TemplateGallery,
			{ context: context({ items: [MISSING_DE] }) },
			globals,
		)
		await flush()
		expect(loaded.host.querySelector('[data-gallery-skeleton]')).toBeNull()
		const section = query(loaded.host, 'section', HTMLElement)
		const card = query(section, 'article, dmscardpanel', HTMLElement)
		const body = elementAs(card.lastElementChild, HTMLElement)

		expect(skeleton.className).toBe(section.className)
		expect(skeletonHeading.className).toContain('flex items-center gap-2')
		expect(skeletonCard.querySelector('uskeleton')?.className).toContain(
			'h-[172px]',
		)
		expect(skeletonBody.className).toBe(body.className)
		expect(skeletonBody.children).toHaveLength(body.children.length)
		expect(skeletonBody.lastElementChild?.className).toBe(
			body.lastElementChild?.className.replace(' text-muted', ''),
		)
		loading.unmount()
		loaded.unmount()
	})

	it('opens the editor on a missing locale chip', async () => {
		const view = mount(
			TemplateGallery,
			{ context: context({ items: [MISSING_DE] }) },
			globals,
		)
		await flush()
		const chips = queryAll(view.host, 'button[aria-label]', HTMLElement)
		const missing = expectDefined(
			chips.find((chip) => chip.textContent?.trim() === 'de'),
		)
		expect(missing.className).toContain('border-dashed')
		missing.click()
		expect(stubs.navigations).toEqual([
			{ path: '/modules/mailing/templates/missing', query: { locale: 'de' } },
		])
		view.unmount()
	})
})
