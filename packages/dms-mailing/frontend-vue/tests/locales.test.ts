import { describe, expect, it } from 'vitest'
import {
	LOCALE_CHIP_MISSING_CLASS,
	localeBadges,
	localeChipClass,
	localeChips,
	localeCoverage,
	localeFallback,
	missingLocales,
	parseLocaleList,
} from '../app/utils/locales'

describe('parseLocaleList', () => {
	it('splits the stored list and drops blanks', () => {
		expect(parseLocaleList('en,fr')).toEqual(['en', 'fr'])
		expect(parseLocaleList(' en , fr ')).toEqual(['en', 'fr'])
		expect(parseLocaleList('')).toEqual([])
		expect(parseLocaleList(undefined)).toEqual([])
		expect(parseLocaleList(null)).toEqual([])
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

describe('localeChips', () => {
	it('keeps locales the workspace no longer offers after its own', () => {
		expect(localeChips('it,en', ['en', 'fr'])).toEqual([
			{ code: 'en', present: true },
			{ code: 'fr', present: false },
			{ code: 'it', present: true },
		])
		expect(localeChips('', ['en'])).toEqual([])
	})
})

describe('missingLocales', () => {
	it('lists the workspace locales a content lacks', () => {
		expect(missingLocales(['en'], ['en', 'fr', 'de'])).toEqual(['fr', 'de'])
		expect(missingLocales(['en', 'fr'], ['en', 'fr'])).toEqual([])
	})
})

describe('localeFallback', () => {
	it('spots a send rendered in another locale than asked', () => {
		expect(localeFallback('en', 'de')).toEqual({
			used: 'en',
			requested: 'de',
			isFallback: true,
		})
	})

	it('reads a missing or equal request as no fallback', () => {
		expect(localeFallback('en', 'en').isFallback).toBe(false)
		expect(localeFallback('en', undefined)).toEqual({
			used: 'en',
			requested: 'en',
			isFallback: false,
		})
		expect(localeFallback(undefined, 'de').used).toBe('')
	})
})

describe('localeChipClass', () => {
	it('dashes a missing locale', () => {
		expect(localeChipClass(false)).toContain(LOCALE_CHIP_MISSING_CLASS)
		expect(localeChipClass(true)).not.toContain('border-dashed')
	})
})
