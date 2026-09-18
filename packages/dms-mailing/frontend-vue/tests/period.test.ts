import { describe, expect, it } from 'vitest'
import { periodQuery } from '../app/utils/period'

describe('periodQuery', () => {
	it('serialises a period state into the query the backend expects', () => {
		const from = new Date('2026-08-10T00:00:00.000Z')
		const to = new Date('2026-09-09T00:00:00.000Z')
		expect(periodQuery({ range: { from, to }, compareRange: null })).toEqual({
			from: from.toISOString(),
			to: to.toISOString(),
		})
	})
})
