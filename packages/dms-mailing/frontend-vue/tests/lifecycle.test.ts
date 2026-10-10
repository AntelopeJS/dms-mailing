import { describe, expect, it } from 'vitest'
import {
	canPublish,
	lifecycleActions,
	noticeFor,
	publishedMoment,
} from '../app/utils/lifecycle'

describe('lifecycle', () => {
	it('offers only the transitions the backend accepts', () => {
		expect(lifecycleActions('live').map((button) => button.action)).toEqual([
			'unpublish',
			'archive',
		])
		expect(lifecycleActions('draft').map((button) => button.action)).toEqual([
			'archive',
		])
		expect(lifecycleActions('archived').map((button) => button.action)).toEqual(
			['restore'],
		)
		expect(canPublish('archived')).toBe(false)
		expect(canPublish('draft')).toBe(true)
	})
	it('picks the notice from status, version and pending changes', () => {
		expect(noticeFor({ status: 'live', version: 12, changeCount: 3 })).toEqual({
			kind: 'live_changes',
			canCompare: true,
			canDiscard: true,
		})
		expect(
			noticeFor({ status: 'live', version: 12, changeCount: 0 })?.kind,
		).toBe('live_clean')
		expect(noticeFor({ status: 'draft', version: 0, changeCount: 2 })).toEqual({
			kind: 'never_published',
			canCompare: false,
			canDiscard: false,
		})
		expect(
			noticeFor({ status: 'draft', version: 0, changeCount: 0 }),
		).toBeNull()
		expect(
			noticeFor({ status: 'draft', version: 4, changeCount: 1 })?.kind,
		).toBe('draft_changes')
		expect(
			noticeFor({ status: 'archived', version: 4, changeCount: 0 }),
		).toBeNull()
	})
	it('splits a publication date for the notice', () => {
		const moment = publishedMoment('2026-09-29T09:14:00', 'en-GB')
		expect(moment?.time).toBe('09:14')
		expect(moment?.date).toContain('29')
		expect(publishedMoment(null, 'en-GB')).toBeNull()
		expect(publishedMoment('nope', 'en-GB')).toBeNull()
	})
})
