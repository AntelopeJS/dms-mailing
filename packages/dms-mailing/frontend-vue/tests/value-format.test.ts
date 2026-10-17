import { describe, expect, it } from 'vitest'
import { resolveToken } from '../app/utils/tokens'
import { formatValue, valueFormatOf } from '../app/utils/value-format'
import {
	formatValue as engineFormatValue,
	valueFormatOf as engineValueFormatOf,
} from '../../src/engine/formats'

const DATE_VARIABLES = [
	{ path: 'quote.validUntil', type: 'date' as const, required: true },
]

const SAMPLES: Array<[unknown, string]> = [
	[{ value: 987420, currency: 'EUR' }, 'quote.total'],
	[{ value: 1500, currency: 'JPY' }, 'quote.total'],
	[{ value: 1234, currency: 'not a currency' }, 'quote.total'],
	['2026-11-14', 'quote.validUntil'],
	['2026-11-14T09:30:00Z', 'quote.validUntil'],
	['2026-11-14', 'quote.number'],
	['samedi 14 novembre', 'quote.validUntil'],
	[new Date(Date.UTC(2026, 10, 14, 12)), 'any.path'],
	[12345, 'order.number'],
]

describe('formatValue', () => {
	it('writes every value exactly like the engine', () => {
		for (const locale of ['en', 'fr', 'de-BE']) {
			const format = valueFormatOf(locale, DATE_VARIABLES)
			const engine = engineValueFormatOf(locale, DATE_VARIABLES)
			for (const [value, path] of SAMPLES)
				expect(formatValue(value, path, format)).toBe(
					engineFormatValue(value, path, engine),
				)
		}
	})

	it('shows a typed test value on the paper as the recipient reads it', () => {
		const format = valueFormatOf('fr', DATE_VARIABLES)
		const data = { quote: { validUntil: '2026-11-14' } }
		expect(resolveToken('quote.validUntil', data, format)).toEqual({
			isPresent: true,
			text: '14 novembre 2026',
		})
		expect(resolveToken('quote.validUntil', data).text).toBe('2026-11-14')
	})
})
