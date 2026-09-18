import type { SendEventRow, SendStatus } from '../types/mailing'

export type TimelineTone =
	'neutral' | 'success' | 'primary' | 'error' | 'warning'

export interface TimelineMeta {
	icon: string
	tone: TimelineTone
}

export interface TimelineItem {
	id: string
	type: SendStatus
	icon: string
	tone: TimelineTone
	description: string
	at: string
}

export const TIMELINE_META: Record<SendStatus, TimelineMeta> = {
	queued: { icon: 'i-ph-clock', tone: 'neutral' },
	sent: { icon: 'i-ph-paper-plane-tilt', tone: 'primary' },
	delivered: { icon: 'i-ph-check', tone: 'success' },
	opened: { icon: 'i-ph-eye', tone: 'primary' },
	clicked: { icon: 'i-ph-cursor-click', tone: 'primary' },
	bounced: { icon: 'i-ph-warning', tone: 'error' },
	spam: { icon: 'i-ph-prohibit', tone: 'warning' },
	failed: { icon: 'i-ph-warning', tone: 'error' },
	unsubscribed: { icon: 'i-ph-user-minus', tone: 'warning' },
}

const DESCRIPTION_KEYS = ['reason', 'url', 'userAgent']

interface EventDetails {
	[key: string]: unknown
}

function parseDetails(raw: string): EventDetails {
	try {
		const parsed: unknown = raw ? JSON.parse(raw) : {}
		return typeof parsed === 'object' && parsed !== null
			? (parsed as EventDetails)
			: {}
	} catch {
		return {}
	}
}

function describe(details: EventDetails): string {
	const key = DESCRIPTION_KEYS.find((candidate) => details[candidate])
	return key ? String(details[key]) : ''
}

/**
 * Orders a send's events oldest-first and resolves the icon, tone and one-line
 * description each row shows.
 */
export function buildTimeline(events: SendEventRow[]): TimelineItem[] {
	return [...events]
		.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
		.map((event) => ({
			id: event._id,
			type: event.type,
			at: event.at,
			description: describe(parseDetails(event.json_details)),
			...TIMELINE_META[event.type],
		}))
}
