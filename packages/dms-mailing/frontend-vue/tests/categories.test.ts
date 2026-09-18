import { describe, expect, it } from 'vitest'
import {
	fromCategoryOption,
	NO_CATEGORY,
	parseCategories,
	serializeCategories,
	slugifyId,
	toCategoryOption,
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
