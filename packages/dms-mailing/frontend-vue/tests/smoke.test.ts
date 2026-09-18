import { describe, expect, it } from 'vitest'
import { SEND_STATUSES } from '../app/types/mailing'

describe('types', () => {
	it('exposes the send statuses', () => {
		expect(SEND_STATUSES).toContain('bounced')
	})
})
