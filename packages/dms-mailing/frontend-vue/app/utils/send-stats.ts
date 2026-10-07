import type { SendStats } from '../types/mailing'
import { minutesSince } from './period'

export type StatTone = 'neutral' | 'error' | 'warning' | 'success'

/** A stat cell, shaped like `DmsStatGroup`'s items. */
export interface SendStatItem {
	id: string
	icon: string
	tone?: StatTone
	eyebrow: string
	value: string
	detail: string
	detailTone?: StatTone
	to?: string
}

export type Translate = (
	key: string,
	params?: Record<string, unknown>,
) => string

export interface SendStatsContext {
	translate: Translate
	locale: string
	provider: string
	now: Date
}

/** Past this wait the oldest queued send is worth a warning. */
export const QUEUE_WARNING_MINUTES = 10
/** Past this latency the drawer shows the API call in red. */
export const SLOW_LATENCY_MS = 5000

const MS_PER_SECOND = 1000
const PERCENT = 100
const RATE_DECIMALS = 1
const SECONDS_DECIMALS = 1
const PROBLEMS_PAGE = '/modules/mailing/sends?view=problems'
const KEY_PREFIX = 'dms_mailing.sends.stats.'
const DELTA_UP = '▲'
const DELTA_DOWN = '▼'
const DETAIL_SEPARATOR = ' · '

const PROBLEM_PARTS = ['bounced', 'failed', 'spam'] as const

const key = (path: string): string => `${KEY_PREFIX}${path}`

/** A latency as the log prints it: milliseconds, seconds past 5 s, a dash when unknown. */
export function formatLatency(
	ms: number | null | undefined,
	locale: string,
): string {
	if (ms === null || ms === undefined) return '—'
	if (ms < SLOW_LATENCY_MS)
		return `${new Intl.NumberFormat(locale).format(ms)} ms`
	const seconds = new Intl.NumberFormat(locale, {
		minimumFractionDigits: SECONDS_DECIMALS,
		maximumFractionDigits: SECONDS_DECIMALS,
	}).format(ms / MS_PER_SECOND)
	return `${seconds} s`
}

export function isSlowLatency(ms: number | null | undefined): boolean {
	return (ms ?? 0) >= SLOW_LATENCY_MS
}

/** A period-over-period change with its arrow ("▲ +8 %"); empty when flat. */
export function formatDelta(delta: number, locale: string): string {
	if (!delta) return ''
	const percent = new Intl.NumberFormat(locale, {
		style: 'percent',
		maximumFractionDigits: RATE_DECIMALS,
		signDisplay: 'always',
	}).format(delta / PERCENT)
	return `${delta > 0 ? DELTA_UP : DELTA_DOWN} ${percent}`
}

function formatPercent(rate: number, locale: string): string {
	return new Intl.NumberFormat(locale, {
		style: 'percent',
		maximumFractionDigits: RATE_DECIMALS,
	}).format(rate / PERCENT)
}

function sendsItem(stats: SendStats, context: SendStatsContext): SendStatItem {
	const { translate, locale } = context
	const parts = [
		formatDelta(stats.sendsDelta, locale),
		stats.tests ? translate(key('tests_excluded'), { count: stats.tests }) : '',
	].filter(Boolean)
	return {
		id: 'sends',
		icon: 'i-ph-paper-plane-tilt',
		eyebrow: translate(key('sends')),
		value: new Intl.NumberFormat(locale).format(stats.sends),
		detail: parts.join(DETAIL_SEPARATOR) || translate(key('no_tests')),
	}
}

function deliveredItem(
	stats: SendStats,
	context: SendStatsContext,
): SendStatItem {
	const { translate, locale } = context
	const number = new Intl.NumberFormat(locale)
	return {
		id: 'delivered',
		icon: 'i-ph-check-circle',
		eyebrow: translate(key('delivered')),
		value: stats.sends ? formatPercent(stats.deliverability, locale) : '—',
		detail: translate(key('delivered_of'), {
			delivered: number.format(stats.delivered),
			sends: number.format(stats.sends),
		}),
	}
}

function problemsItem(
	stats: SendStats,
	context: SendStatsContext,
): SendStatItem {
	const { translate } = context
	const breakdown = PROBLEM_PARTS.filter((part) => stats[part])
		.map((part) => translate(key(`breakdown.${part}`), { count: stats[part] }))
		.join(DETAIL_SEPARATOR)
	return {
		id: 'problems',
		icon: 'i-ph-warning-octagon',
		tone: stats.problems ? 'error' : undefined,
		eyebrow: translate(key('problems')),
		value: String(stats.problems),
		detail: stats.problems ? breakdown : translate(key('no_problems')),
		to: stats.problems ? PROBLEMS_PAGE : undefined,
	}
}

function queuedItem(stats: SendStats, context: SendStatsContext): SendStatItem {
	const { translate, now } = context
	const minutes = minutesSince(stats.oldestQueuedAt, now)
	const isWaitingLong = !!stats.queued && minutes > QUEUE_WARNING_MINUTES
	return {
		id: 'queued',
		icon: 'i-ph-clock',
		eyebrow: translate(key('queued')),
		value: String(stats.queued),
		detail: stats.queued
			? translate(key('oldest_waiting'), { minutes })
			: translate(key('nothing_waiting')),
		detailTone: isWaitingLong ? 'warning' : undefined,
	}
}

function latencyItem(
	stats: SendStats,
	context: SendStatsContext,
): SendStatItem {
	const { translate, locale, provider } = context
	return {
		id: 'latency',
		icon: 'i-ph-timer',
		eyebrow: translate(key('latency')),
		value: stats.sends ? formatLatency(stats.latencyMedian, locale) : '—',
		detail: provider
			? translate(key('latency_detail'), { provider })
			: translate(key('latency_detail_generic')),
	}
}

const ITEM_BUILDERS = [
	sendsItem,
	deliveredItem,
	problemsItem,
	queuedItem,
	latencyItem,
]

/**
 * The five cells of the send log's stat strip (ML-09): sends with the tests
 * left out, deliverability, problems with their breakdown and a link to the
 * Problems tab, the queue with its oldest wait, and the median API latency.
 */
export function buildSendStatItems(
	stats: SendStats,
	context: SendStatsContext,
): SendStatItem[] {
	return ITEM_BUILDERS.map((build) => build(stats, context))
}
