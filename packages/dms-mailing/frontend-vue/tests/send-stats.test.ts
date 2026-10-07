import { describe, expect, it } from 'vitest'
import {
	buildSendStatItems,
	formatDelta,
	formatLatency,
	isSlowLatency,
	type SendStatsContext,
} from '../app/utils/send-stats'
import type { SendStats } from '../app/types/mailing'

const STATS: SendStats = {
	sends: 612,
	sendsDelta: 8,
	tests: 8,
	delivered: 605,
	deliverability: 98.856,
	problems: 3,
	bounced: 1,
	failed: 1,
	spam: 1,
	queued: 1,
	oldestQueuedAt: '2026-09-09T13:57:00.000Z',
	latencyMedian: 204,
}

const context: SendStatsContext = {
	translate: (key, params) =>
		`${key.split('.').at(-1)}${params ? JSON.stringify(params) : ''}`,
	locale: 'en-GB',
	provider: 'Brevo',
	now: new Date('2026-09-09T14:32:00.000Z'),
}

const byId = (stats: SendStats) =>
	Object.fromEntries(
		buildSendStatItems(stats, context).map((item) => [item.id, item]),
	)

describe('formatLatency', () => {
	it('prints milliseconds, seconds past 5 s, a dash when unknown', () => {
		expect(formatLatency(204, 'en-GB')).toBe('204 ms')
		expect(formatLatency(30000, 'en-GB')).toBe('30.0 s')
		expect(formatLatency(null, 'en-GB')).toBe('—')
		expect(isSlowLatency(30000)).toBe(true)
		expect(isSlowLatency(204)).toBe(false)
	})
})

describe('formatDelta', () => {
	it('leads with an arrow and a sign', () => {
		expect(formatDelta(8, 'en-GB')).toBe('▲ +8%')
		expect(formatDelta(-1.8, 'en-GB')).toBe('▼ -1.8%')
		expect(formatDelta(0, 'en-GB')).toBe('')
	})
})

describe('buildSendStatItems', () => {
	it('draws the five cells in order', () => {
		expect(buildSendStatItems(STATS, context).map((item) => item.id)).toEqual([
			'sends',
			'delivered',
			'problems',
			'queued',
			'latency',
		])
	})

	it('leaves the tests out of the sends and says so', () => {
		const { sends } = byId(STATS)
		expect(sends?.value).toBe('612')
		expect(sends?.detail).toBe('▲ +8% · tests_excluded{"count":8}')
	})

	it('shows deliverability with its counts', () => {
		const { delivered } = byId(STATS)
		expect(delivered?.value).toBe('98.9%')
		expect(delivered?.detail).toBe(
			'delivered_of{"delivered":"605","sends":"612"}',
		)
	})

	it('breaks problems down and links them to the Problems tab', () => {
		const { problems } = byId(STATS)
		expect(problems).toMatchObject({
			tone: 'error',
			to: '/modules/mailing/sends?view=problems',
		})
		expect(problems?.detail).toBe(
			'bounced{"count":1} · failed{"count":1} · spam{"count":1}',
		)
		const quiet = byId({
			...STATS,
			problems: 0,
			bounced: 0,
			failed: 0,
			spam: 0,
		}).problems
		expect(quiet).toMatchObject({
			tone: undefined,
			to: undefined,
			detail: 'no_problems',
		})
	})

	it('warns when the oldest queued send waits more than 10 minutes', () => {
		expect(byId(STATS).queued).toMatchObject({
			detail: 'oldest_waiting{"minutes":35}',
			detailTone: 'warning',
		})
		const fresh = byId({
			...STATS,
			oldestQueuedAt: '2026-09-09T14:30:00.000Z',
		}).queued
		expect(fresh?.detailTone).toBeUndefined()
	})

	it('names the provider under the latency', () => {
		expect(byId(STATS).latency).toMatchObject({
			value: '204 ms',
			detail: 'latency_detail{"provider":"Brevo"}',
		})
	})
})
