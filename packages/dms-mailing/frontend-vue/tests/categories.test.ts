import { describe, expect, it } from 'vitest'
import {
	CATEGORY_ICONS,
	DEFAULT_CATEGORY_ICON,
	categoryMoves,
	iconName,
	keptCategories,
	moveRow,
	newCategoryIcon,
	redirectMoves,
	withMoves,
	fromCategoryOption,
	NO_CATEGORY,
	slugifyId,
	toCategoryOption,
	toStoredCategories,
	toEditableRows,
	toStoredCategory,
	uniqueId,
	type EditableCategory,
} from '../app/utils/categories'
import type { StoredCategory } from '../app/types/mailing'

const CATEGORIES: StoredCategory[] = [
	{ id: 'orders', label: { en: 'Orders' }, icon: 'i-ph-package' },
]

describe('slugifyId', () => {
	it('derives a stable id from a label', () => {
		expect(slugifyId('Orders & refunds')).toBe('orders-refunds')
		expect(slugifyId('  Facturation  ')).toBe('facturation')
		expect(slugifyId('Été 2026')).toBe('ete-2026')
	})

	it('answers an empty string when nothing survives', () => {
		expect(slugifyId('!!!')).toBe('')
	})
})

describe('the uncategorised sentinel', () => {
	// Reka's `Select` reserves the empty string for "nothing selected": an item
	// offering it makes the listbox refuse to open, silently. The sentinel must
	// therefore never be empty, and must never leak out of the widget.
	it('is never the empty string', () => {
		expect(NO_CATEGORY).not.toBe('')
	})

	it('maps every empty form of "no category" onto the sentinel', () => {
		expect(toCategoryOption('')).toBe(NO_CATEGORY)
		expect(toCategoryOption(null)).toBe(NO_CATEGORY)
		expect(toCategoryOption(undefined)).toBe(NO_CATEGORY)
	})

	it('leaves a real category id alone in both directions', () => {
		expect(toCategoryOption('orders')).toBe('orders')
		expect(fromCategoryOption('orders')).toBe('orders')
	})

	it('maps the sentinel back to the empty value callers expect', () => {
		expect(fromCategoryOption(NO_CATEGORY)).toBe('')
		expect(fromCategoryOption(toCategoryOption(null))).toBe('')
	})
})

describe('toStoredCategory', () => {
	// The data-api edit leaves an absent key unchanged from 0.2.0 on, so "no
	// category" must travel as an explicit `null` to clear a stored one.
	it('sends null for every empty form of "no category"', () => {
		expect(toStoredCategory('')).toBeNull()
		expect(toStoredCategory(null)).toBeNull()
		expect(toStoredCategory(undefined)).toBeNull()
		expect(toStoredCategory(fromCategoryOption(NO_CATEGORY))).toBeNull()
	})

	it('keeps a real category id', () => {
		expect(toStoredCategory('orders')).toBe('orders')
	})
})

describe('uniqueId', () => {
	it('suffixes an id already taken', () => {
		expect(uniqueId('orders', new Set())).toBe('orders')
		expect(uniqueId('orders', new Set(['orders', 'orders-2']))).toBe('orders-3')
	})
})

const row = (patch: Partial<EditableCategory>): EditableCategory => ({
	key: patch.label ?? 'row',
	id: '',
	label: '',
	icon: 'i-ph-package',
	isNew: false,
	labels: {},
	...patch,
})

describe('toStoredCategories', () => {
	it('keeps saved ids even after a rename', () => {
		expect(
			toStoredCategories([row({ id: 'orders', label: 'Purchases' })], 'en'),
		).toEqual([
			{ id: 'orders', label: { en: 'Purchases' }, icon: 'i-ph-package' },
		])
	})

	it('shows each label in the language edited and writes it back there only', () => {
		const stored: StoredCategory[] = [
			{
				id: 'orders',
				label: { en: 'Orders', fr: 'Commandes' },
				icon: 'i-ph-package',
			},
			{ id: 'billing', label: { en: 'Billing' }, icon: 'i-ph-file-text' },
		]
		let next = 0
		const rows = toEditableRows(stored, 'fr', () => `row-${next++}`)
		expect(rows.map((entry) => entry.label)).toEqual(['Commandes', 'Billing'])
		rows[0]!.label = 'Achats'
		rows[1]!.label = 'Facturation'
		expect(toStoredCategories(rows, 'fr')).toEqual([
			{
				id: 'orders',
				label: { en: 'Orders', fr: 'Achats' },
				icon: 'i-ph-package',
			},
			{
				id: 'billing',
				label: { en: 'Billing', fr: 'Facturation' },
				icon: 'i-ph-file-text',
			},
		])
	})

	it('derives a new row id from its whole label, unique among the others', () => {
		const stored = toStoredCategories(
			[
				row({ id: 'billing', label: 'Billing' }),
				row({ label: 'Billing', isNew: true }),
				row({ label: 'Été', isNew: true }),
			],
			'en',
		)
		expect(stored.map((category) => category.id)).toEqual([
			'billing',
			'billing-2',
			'ete',
		])
	})

	it('keeps a row without a label, for the server to name, and fills a missing icon', () => {
		const stored = toStoredCategories(
			[
				row({ label: '   ', isNew: true }),
				row({ label: '!!!', isNew: true, icon: '' }),
			],
			'en',
		)
		expect(stored).toEqual([
			{ id: 'category', label: { en: '' }, icon: 'i-ph-package' },
			{ id: 'category-2', label: { en: '!!!' }, icon: 'i-ph-folder' },
		])
	})
})

describe('CATEGORY_ICONS', () => {
	it('offers sixteen distinct Phosphor icons', () => {
		expect(new Set(CATEGORY_ICONS).size).toBe(16)
		expect(CATEGORY_ICONS.every((icon) => icon.startsWith('i-ph-'))).toBe(true)
	})
})

describe('moveRow', () => {
	it('moves a row up or down and says where it went', () => {
		expect(moveRow(['a', 'b', 'c'], 1, -1)).toEqual({
			rows: ['b', 'a', 'c'],
			index: 0,
		})
		expect(moveRow(['a', 'b', 'c'], 1, 1)).toEqual({
			rows: ['a', 'c', 'b'],
			index: 2,
		})
	})

	it('stays put at either end', () => {
		const rows = ['a', 'b']
		expect(moveRow(rows, 0, -1)).toEqual({ rows, index: 0 })
		expect(moveRow(rows, 1, 1)).toEqual({ rows, index: 1 })
	})
})

describe('category moves', () => {
	const gone = { id: 'gone', label: { en: 'Gone' }, icon: 'i-ph-gift' }

	it('hands the form the kept categories, then the moved ones', () => {
		const entries = withMoves(CATEGORIES, [
			{ ...gone, moveTo: 'orders' },
			{ ...gone, id: 'dropped', moveTo: '' },
		])
		expect(entries).toEqual([...CATEGORIES, { ...gone, moveTo: 'orders' }])
		expect(keptCategories(entries)).toEqual(CATEGORIES)
		expect([...categoryMoves(entries)]).toEqual([['gone', 'orders']])
	})

	it('follows a removed target, or drops the move when it goes nowhere', () => {
		const moves = [{ ...gone, moveTo: 'orders' }]
		expect(redirectMoves(moves, 'orders', 'billing')).toEqual([
			{ ...gone, moveTo: 'billing' },
		])
		expect(redirectMoves(moves, 'orders', '')).toEqual([])
		expect(redirectMoves(moves, 'other', '')).toEqual(moves)
	})
})

describe('iconName', () => {
	it('names an icon for its i18n label', () => {
		expect(iconName('i-ph-megaphone')).toBe('megaphone')
		expect(iconName('i-ph-shopping-cart')).toBe('shopping_cart')
	})
})

describe('newCategoryIcon', () => {
	it('picks the first icon no category uses yet', () => {
		expect(newCategoryIcon(CATEGORIES)).toBe(CATEGORY_ICONS[1])
		expect(newCategoryIcon([])).toBe(CATEGORY_ICONS[0])
	})

	it('falls back to the default once every icon is taken', () => {
		const all = CATEGORY_ICONS.map((icon, index) => ({
			id: `c${index}`,
			label: `C${index}`,
			icon,
		}))
		expect(newCategoryIcon(all)).toBe(DEFAULT_CATEGORY_ICON)
	})
})
