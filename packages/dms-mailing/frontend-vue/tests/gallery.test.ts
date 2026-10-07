import { describe, expect, it } from 'vitest'
import {
	UNCATEGORISED_GROUP_ID,
	firstName,
	formatCardDate,
	groupByCategory,
	isNarrowed,
	searchTermOf,
	userFilterKeys,
} from '../app/utils/gallery'

const CATEGORIES = [
	{ id: 'orders', label: 'Orders', icon: 'i-ph-package' },
	{ id: 'billing', label: 'Billing', icon: 'i-ph-file-text' },
]
const rows = [
	{ _id: '1', category: 'billing' },
	{ _id: '2', category: 'orders' },
	{ _id: '3', category: 'unknown' },
	{ _id: '4' },
	{ _id: '5', category: null },
]

describe('groupByCategory', () => {
	it('keeps the settings order and collects the uncategorised last', () => {
		const groups = groupByCategory(rows, CATEGORIES, 'Uncategorised')
		expect(groups.map((group) => group.category.id)).toEqual([
			'orders',
			'billing',
			UNCATEGORISED_GROUP_ID,
		])
		expect(groups[2]?.items.map((row) => row._id)).toEqual(['3', '4', '5'])
	})

	it('labels the trailing group with what the caller translated', () => {
		const groups = groupByCategory([{ _id: '1' }], [], 'Sans catégorie')
		expect(groups[0]?.category.label).toBe('Sans catégorie')
	})

	it('drops empty groups', () => {
		const groups = groupByCategory(
			[{ _id: '1', category: 'orders' }],
			CATEGORIES,
			'x',
		)
		expect(groups.map((group) => group.category.id)).toEqual(['orders'])
	})
})

describe('table query helpers', () => {
	it('reads the trimmed search term', () => {
		expect(searchTermOf({ search: '  refund ' })).toBe('refund')
		expect(searchTermOf({ search: undefined })).toBe('')
		expect(searchTermOf(undefined)).toBe('')
	})

	it('tells user filters from the status tab', () => {
		const query = {
			filter_status: 'is:draft',
			filter_category: 'is:billing',
			sortKey: 'updatedAt',
		}
		expect(userFilterKeys(query)).toEqual(['filter_category'])
		expect(isNarrowed(query)).toBe(true)
		expect(isNarrowed({ filter_status: 'is_not:archived' })).toBe(false)
		expect(isNarrowed({ search: 'x' })).toBe(true)
	})
})

describe('formatCardDate', () => {
	const now = new Date('2026-10-07T12:00:00Z')

	it('reads recent edits as relative time', () => {
		expect(formatCardDate('2026-10-07T10:00:00Z', now, 'en')).toBe('2 hr. ago')
		expect(formatCardDate('2026-10-07T11:55:00Z', now, 'en')).toBe('5 min. ago')
		expect(formatCardDate('2026-10-07T10:00:00Z', now, 'fr')).toMatch(
			/^il y a 2\sh$/,
		)
	})

	it('reads older ones as a short date', () => {
		expect(formatCardDate('2026-09-27T09:00:00Z', now, 'en')).toBe('Sep 27')
	})

	it('answers nothing for an unreadable date', () => {
		expect(formatCardDate('', now, 'en')).toBe('')
		expect(formatCardDate('nope', now, 'en')).toBe('')
	})
})

describe('firstName', () => {
	it('keeps the first word of a name', () => {
		expect(firstName('Hugo Bernard')).toBe('Hugo')
		expect(firstName('')).toBe('')
		expect(firstName(undefined)).toBe('')
	})
})
