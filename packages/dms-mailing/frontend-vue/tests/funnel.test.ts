import { describe, expect, it } from 'vitest'
import {
	biggestDrop,
	deltaTone,
	formatDelta,
	formatRate,
	funnelTakeaway,
	isCompared,
	type FunnelStepReading,
} from '../app/utils/funnel'

const step = (
	id: string,
	count: number,
	isMeasured = true,
): FunnelStepReading => ({
	id,
	label: `$dms_mailing.funnel.${id}`,
	count,
	rate: 0,
	isMeasured,
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

	// A provider that reports nothing leaves "delivered" at 0: that is not a
	// leak between sent and delivered.
	it('never blames a step nothing measures', () => {
		expect(
			biggestDrop([
				step('sent', 32),
				step('delivered', 0, false),
				step('opened', 0, false),
				step('clicked', 0, false),
				step('unsubscribed', 0),
			]),
		).toBeNull()
	})
})

describe('funnelTakeaway', () => {
	it('tells an empty period, an unmeasured funnel and a funnel without loss apart', () => {
		expect(funnelTakeaway([])).toBe('empty')
		expect(funnelTakeaway([step('sent', 0), step('delivered', 0)])).toBe(
			'empty',
		)
		expect(funnelTakeaway([step('sent', 4), step('delivered', 0, false)])).toBe(
			'untracked',
		)
		expect(funnelTakeaway([step('sent', 4), step('delivered', 4)])).toBe(
			'no_loss',
		)
		expect(funnelTakeaway([step('sent', 4), step('delivered', 2)])).toBe('drop')
	})
})

describe('formatRate', () => {
	it('prints one decimal at most', () => {
		expect(formatRate(98.6, 'en-GB')).toBe('98.6%')
		expect(formatRate(100, 'en-GB')).toBe('100%')
	})

	it('prints a dash for a rate without a base', () => {
		expect(formatRate(null, 'en-GB')).toBe('—')
	})
})

describe('the comparison of the steps', () => {
	it('is on as soon as a step carries a compared count', () => {
		expect(isCompared([step('sent', 4)])).toBe(false)
		expect(isCompared([{ ...step('sent', 4), previousCount: 0 }])).toBe(true)
	})

	it('prints the change with its arrow, a dash without one', () => {
		expect(formatDelta(12.5, 'en-GB')).toBe('▲ 12.5%')
		expect(formatDelta(-40, 'en-GB')).toBe('▼ 40%')
		expect(formatDelta(0, 'en-GB')).toBe('0%')
		expect(formatDelta(undefined, 'en-GB')).toBe('—')
	})

	it('reads growth as good down the funnel and bad for the leak', () => {
		expect(deltaTone({ ...step('opened', 4), delta: 10 })).toBe('success')
		expect(deltaTone({ ...step('opened', 4), delta: -10 })).toBe('error')
		expect(deltaTone({ ...step('unsubscribed', 4), delta: 10 })).toBe('error')
		expect(deltaTone({ ...step('unsubscribed', 4), delta: -10 })).toBe('success')
		expect(deltaTone(step('opened', 4))).toBe('neutral')
	})
})
