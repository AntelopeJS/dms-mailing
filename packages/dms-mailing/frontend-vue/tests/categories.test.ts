import { describe, expect, it } from 'vitest'
import {
	CATEGORY_ICONS,
	formatCategoriesLike,
	fromCategoryOption,
	NO_CATEGORY,
	parseCategories,
	serializeCategories,
	slugifyId,
	toCategoryOption,
	toStoredCategories,
	toStoredCategory,
	uniqueId,
	type EditableCategory,
} from '../app/utils/categories'
import type { TemplateCategory } from '../app/types/mailing'

const CATEGORIES: TemplateCategory[] = [
	{ id: 'orders', label: 'Orders', icon: 'i-ph-package' },
]

describe('parseCategories', () => {
	it('round-trips through the string form the form field stores', () => {
		expect(parseCategories(serializeCategories(CATEGORIES))).toEqual(CATEGORIES)
		expect(parseCategories('')).toEqual([])
		expect(parseCategories('not json')).toEqual([])
		expect(parseCategories(undefined)).toEqual([])
	})

	it('accepts an already-parsed array', () => {
		expect(parseCategories(CATEGORIES)).toEqual(CATEGORIES)
	})
})

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

describe('formatCategoriesLike', () => {
	it('writes back in the shape the field handed in', () => {
		expect(formatCategoriesLike(CATEGORIES, CATEGORIES)).toEqual(CATEGORIES)
		expect(formatCategoriesLike('[]', CATEGORIES)).toBe(
			serializeCategories(CATEGORIES),
		)
		expect(formatCategoriesLike(null, CATEGORIES)).toBe(
			serializeCategories(CATEGORIES),
		)
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
	...patch,
})

describe('toStoredCategories', () => {
	it('keeps saved ids even after a rename', () => {
		expect(
			toStoredCategories([row({ id: 'orders', label: 'Purchases' })]),
		).toEqual([{ id: 'orders', label: 'Purchases', icon: 'i-ph-package' }])
	})

	it('derives a new row id from its whole label, unique among the others', () => {
		const stored = toStoredCategories([
			row({ id: 'billing', label: 'Billing' }),
			row({ label: 'Billing', isNew: true }),
			row({ label: 'Été', isNew: true }),
		])
		expect(stored.map((category) => category.id)).toEqual([
			'billing',
			'billing-2',
			'ete',
		])
	})

	it('leaves out rows without a label and fills a missing icon', () => {
		const stored = toStoredCategories([
			row({ label: '   ', isNew: true }),
			row({ label: '!!!', isNew: true, icon: '' }),
		])
		expect(stored).toEqual([
			{ id: 'category', label: '!!!', icon: 'i-ph-folder' },
		])
	})
})

describe('CATEGORY_ICONS', () => {
	it('offers sixteen distinct Phosphor icons', () => {
		expect(new Set(CATEGORY_ICONS).size).toBe(16)
		expect(CATEGORY_ICONS.every((icon) => icon.startsWith('i-ph-'))).toBe(true)
	})
})
