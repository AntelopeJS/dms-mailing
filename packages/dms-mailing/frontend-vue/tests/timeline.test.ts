import { describe, expect, it } from 'vitest'
import { buildTimeline } from '../app/utils/timeline'

describe('buildTimeline', () => {
	it('orders events by time and marks problems', () => {
		const items = buildTimeline([
			{
				_id: '2',
				sendId: 's',
				type: 'bounced',
				at: '2026-09-09T10:01:00.000Z',
				json_details: '{"reason":"550"}',
			},
			{
				_id: '1',
				sendId: 's',
				type: 'sent',
				at: '2026-09-09T10:00:00.000Z',
				json_details: '{}',
			},
		])
		expect(items.map((item) => item.type)).toEqual(['sent', 'bounced'])
		expect(items[1]).toMatchObject({
			tone: 'error',
			description: '550',
			icon: 'i-ph-warning',
		})
	})
})
