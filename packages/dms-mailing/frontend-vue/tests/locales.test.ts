import { describe, expect, it } from 'vitest'
import {
	localeBadges,
	localeCoverage,
	parseLocaleList,
} from '../app/utils/locales'

describe('parseLocaleList', () => {
	it('splits the stored list and drops blanks', () => {
		expect(parseLocaleList('en,fr')).toEqual(['en', 'fr'])
		expect(parseLocaleList(' en , fr ')).toEqual(['en', 'fr'])
		expect(parseLocaleList('')).toEqual([])
		expect(parseLocaleList(undefined)).toEqual([])
	})
})

describe('localeCoverage', () => {
	it('flags locales missing from the present set, in the tenant order', () => {
		expect(localeCoverage(['fr'], ['en', 'fr'])).toEqual([
			{ code: 'en', present: false },
			{ code: 'fr', present: true },
		])
	})
})

describe('localeBadges', () => {
	it('reports coverage against the tenant locales', () => {
		expect(localeBadges('en', ['en', 'fr'])).toEqual([
			{ code: 'en', present: true },
			{ code: 'fr', present: false },
		])
	})

	it('answers nothing when the row carries no locale information', () => {
		expect(localeBadges('', ['en', 'fr'])).toEqual([])
		expect(localeBadges(undefined, ['en', 'fr'])).toEqual([])
	})
})
