import { describe, expect, it } from 'vitest'
import { biggestDrop, formatRate } from '../app/utils/funnel'
import type { FunnelStep } from '../app/types/mailing'

const step = (id: string, count: number): FunnelStep => ({
	id,
	label: `$dms_mailing.funnel.${id}`,
	count,
	rate: 0,
})

describe('biggestDrop', () => {
	it('names the steps with the biggest fall, leaving the leak out', () => {
		const drop = biggestDrop([
			step('sent', 18420),
			step('delivered', 18162),
			step('opened', 7483),
			step('clicked', 1235),
			step('unsubscribed', 37),
		])
		expect(drop?.from.id).toBe('delivered')
		expect(drop?.to.id).toBe('opened')
		expect(drop?.points).toBeCloseTo(57.97, 1)
	})

	it('answers null when nothing was sent or nothing is lost', () => {
		expect(biggestDrop([step('sent', 0), step('delivered', 0)])).toBeNull()
		expect(biggestDrop([step('sent', 5), step('delivered', 5)])).toBeNull()
		expect(biggestDrop([])).toBeNull()
	})
})

describe('formatRate', () => {
	it('prints one decimal at most', () => {
		expect(formatRate(98.6, 'en-GB')).toBe('98.6%')
		expect(formatRate(100, 'en-GB')).toBe('100%')
	})
})
