import { describe, expect, it } from 'vitest'
import { UNCATEGORISED_GROUP_ID, groupByCategory } from '../app/utils/gallery'

const CATEGORIES = [
	{ id: 'orders', label: 'Orders', icon: 'i-ph-package' },
	{ id: 'billing', label: 'Billing', icon: 'i-ph-file-text' },
]
const rows = [
	{ _id: '1', category: 'billing' },
	{ _id: '2', category: 'orders' },
	{ _id: '3', category: 'unknown' },
	{ _id: '4' },
]

describe('groupByCategory', () => {
	it('keeps the settings order and collects the uncategorised last', () => {
		const groups = groupByCategory(rows, CATEGORIES, 'Uncategorised')
		expect(groups.map((group) => group.category.id)).toEqual([
			'orders',
			'billing',
			UNCATEGORISED_GROUP_ID,
		])
		expect(groups[2]?.items.map((row) => row._id)).toEqual(['3', '4'])
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
