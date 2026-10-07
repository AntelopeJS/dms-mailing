import { describe, expect, it } from 'vitest'
import {
	attentionReasons,
	cardFooter,
	daysSince,
	needsAttention,
	readPath,
	validTransitions,
	variablesCovered,
} from '../app/utils/template-attention'
import type { TemplateRow, TemplateStats } from '../app/types/mailing'

const NOW = new Date('2026-10-07T12:00:00Z')
const WORKSPACE = ['en', 'fr', 'de']

function row(overrides: Partial<TemplateRow> = {}): TemplateRow {
	return {
		_id: 't1',
		slug: 'order-confirmed',
		name: 'Order confirmation',
		status: 'live',
		locales: 'en,fr,de',
		updatedAt: '2026-10-06T12:00:00Z',
		updatedBy: 'Julie Martin',
		publishedVersion: 3,
		publishedAt: '2026-09-22T09:00:00Z',
		isDraftPending: false,
		...overrides,
	}
}

function stats(sends: number): TemplateStats {
	return {
		id: 't1',
		slug: 'order-confirmed',
		sends,
		openRate: 71.9,
		problems: 0,
		lastSentAt: null,
	}
}

const reasons = (template: TemplateRow, sendStats?: TemplateStats) =>
	attentionReasons({
		row: template,
		stats: sendStats,
		workspaceLocales: WORKSPACE,
		now: NOW,
	})

describe('daysSince', () => {
	it('counts whole days and ignores unreadable dates', () => {
		expect(daysSince('2026-09-27T12:00:00Z', NOW)).toBe(10)
		expect(daysSince('not a date', NOW)).toBe(0)
		expect(daysSince(null, NOW)).toBe(0)
	})
})

describe('attentionReasons', () => {
	it('leaves a healthy live template alone', () => {
		expect(reasons(row(), stats(12))).toEqual([])
		expect(
			needsAttention({
				row: row(),
				stats: stats(1),
				workspaceLocales: WORKSPACE,
				now: NOW,
			}),
		).toBe(false)
	})

	it('flags a live template no real send used in 30 days', () => {
		expect(reasons(row(), stats(0))).toEqual(['never_sent'])
		expect(reasons(row())).toEqual(['never_sent'])
	})

	it('flags a draft never published, and one untouched for a week', () => {
		expect(reasons(row({ status: 'draft', publishedVersion: 0 }))).toEqual([
			'unpublished_draft',
		])
		expect(
			reasons(row({ status: 'draft', updatedAt: '2026-09-20T12:00:00Z' })),
		).toEqual(['stale_draft'])
	})

	it('flags a missing workspace locale, not an unknown locale list', () => {
		expect(reasons(row({ locales: 'en,fr' }), stats(4))).toEqual([
			'missing_locale',
		])
		expect(reasons(row({ locales: '' }), stats(4))).toEqual([])
	})

	it('never flags an archived template', () => {
		expect(reasons(row({ status: 'archived', locales: 'en' }))).toEqual([])
	})
})

describe('cardFooter', () => {
	it('shows the figures once real sends exist', () => {
		expect(cardFooter(row(), stats(6812))).toMatchObject({
			kind: 'stats',
			sends: 6812,
			openRate: 71.9,
		})
	})

	it('says since when a live template waits for its first send', () => {
		expect(cardFooter(row(), stats(0))).toMatchObject({
			kind: 'no_send',
			at: '2026-09-22T09:00:00Z',
		})
		expect(cardFooter(row({ publishedAt: null }))).toMatchObject({
			kind: 'no_send',
			at: '2026-10-06T12:00:00Z',
		})
	})

	it('names the last editor of a draft', () => {
		expect(cardFooter(row({ status: 'draft' }))).toMatchObject({
			kind: 'edited',
			by: 'Julie Martin',
		})
	})
})

describe('validTransitions', () => {
	it('offers only the moves the backend accepts', () => {
		expect(validTransitions(row({ status: 'draft' }))).toEqual([
			'publish',
			'archive',
		])
		expect(validTransitions(row())).toEqual(['unpublish', 'archive'])
		expect(validTransitions(row({ isDraftPending: true }))).toEqual([
			'publish',
			'unpublish',
			'archive',
		])
		expect(validTransitions(row({ status: 'archived' }))).toEqual(['restore'])
	})
})

describe('readPath', () => {
	it('reads a dotted path and stops on a missing step', () => {
		const data = { order: { number: '#1', lines: [] }, empty: null }
		expect(readPath(data, 'order.number')).toBe('#1')
		expect(readPath(data, 'order.missing.deep')).toBeUndefined()
		expect(readPath(data, 'empty.value')).toBeUndefined()
	})
})

describe('variablesCovered', () => {
	const declared = [
		{ path: 'customer.firstName', type: 'string' as const, required: true },
		{ path: 'order.isFirstOrder', type: 'boolean' as const, required: false },
	]

	it('needs every used path declared and every required one filled', () => {
		expect(
			variablesCovered(declared, ['customer.firstName'], {
				customer: { firstName: 'Margaux' },
			}),
		).toBe(true)
		expect(
			variablesCovered(declared, ['customer.firstName'], { customer: {} }),
		).toBe(false)
		expect(
			variablesCovered(declared, ['order.trackingUrl'], {
				customer: { firstName: 'Margaux' },
			}),
		).toBe(false)
	})
})
