import type { SendEventRow, SendRow, SendStatus } from '../types/mailing'

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
	/** i18n key of the step's title. */
	titleKey: string
	titleParams: Record<string, string>
	/** One line under the title: a raw SMTP answer, a message id, a URL… */
	detail: string
	/** Whether `detail` is a machine value, shown in mono. */
	isDetailMono: boolean
	/** `null` for a step still to come. */
	at: string | null
	/** A step that has not happened yet, drawn ghosted. */
	isPending: boolean
}

export type TimelineSend = Pick<
	SendRow,
	'_id' | 'status' | 'createdAt' | 'provider' | 'providerMessageId' | 'error'
>

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

/** The happy path a send walks; pending steps are drawn from it. */
const HAPPY_PATH: SendStatus[] = ['queued', 'sent', 'delivered', 'opened']

const PROBLEM_STATUSES: SendStatus[] = ['bounced', 'spam', 'failed']

const TITLE_KEY_PREFIX = 'dms_mailing.sends.timeline.'

/** Detail keys read off an event, in order; the first present one is shown. */
const DETAIL_KEYS = ['reason', 'smtp', 'code', 'url', 'userAgent', 'client']
const MONO_DETAIL_KEYS = new Set(['reason', 'smtp', 'code', 'url'])

type EventDetails = Record<string, unknown>

interface Detail {
	text: string
	isMono: boolean
}

const NO_DETAIL: Detail = { text: '', isMono: false }

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

function eventDetail(details: EventDetails): Detail {
	const key = DETAIL_KEYS.find((candidate) => details[candidate])
	if (!key) return NO_DETAIL
	return { text: String(details[key]), isMono: MONO_DETAIL_KEYS.has(key) }
}

/** What a step says beyond its event: the message id, the raw error. */
const SEND_DETAILS: Partial<
	Record<SendStatus, (send: TimelineSend) => Detail>
> = {
	sent: (send) => ({ text: send.providerMessageId ?? '', isMono: true }),
	bounced: (send) => ({ text: send.error ?? '', isMono: true }),
	failed: (send) => ({ text: send.error ?? '', isMono: true }),
}

/** Steps whose title names the provider when the send knows it. */
const PROVIDER_TITLE_KEYS: Partial<Record<SendStatus, string>> = {
	sent: `${TITLE_KEY_PREFIX}sent_to`,
}

interface StepTitle {
	titleKey: string
	titleParams: Record<string, string>
}

function titleOf(type: SendStatus, send: TimelineSend): StepTitle {
	const providerKey = PROVIDER_TITLE_KEYS[type]
	if (providerKey && send.provider)
		return { titleKey: providerKey, titleParams: { provider: send.provider } }
	return { titleKey: `${TITLE_KEY_PREFIX}${type}`, titleParams: {} }
}

function stepOf(
	id: string,
	type: SendStatus,
	at: string | null,
	send: TimelineSend,
	detail: Detail,
): TimelineItem {
	return {
		id,
		type,
		at,
		...TIMELINE_META[type],
		...titleOf(type, send),
		detail: detail.text,
		isDetailMono: detail.isMono,
		isPending: at === null,
	}
}

function happenedSteps(
	events: SendEventRow[],
	send: TimelineSend,
): TimelineItem[] {
	return [...events]
		.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
		.map((event) => {
			const fromEvent = eventDetail(parseDetails(event.json_details))
			const fromSend = SEND_DETAILS[event.type]?.(send) ?? NO_DETAIL
			const detail = fromEvent.text ? fromEvent : fromSend
			return stepOf(event._id, event.type, event.at, send, detail)
		})
}

function pendingSteps(
	send: TimelineSend,
	reached: SendStatus[],
): TimelineItem[] {
	if (PROBLEM_STATUSES.includes(send.status)) return []
	const furthest = Math.max(
		...reached.map((type) => HAPPY_PATH.indexOf(type)),
		HAPPY_PATH.indexOf(send.status),
	)
	if (furthest < 0) return []
	return HAPPY_PATH.slice(furthest + 1).map((type) =>
		stepOf(`pending-${type}`, type, null, send, NO_DETAIL),
	)
}

/**
 * The steps of a send, oldest first: when it was queued (the send's own date
 * unless an event says so), every recorded event with the detail worth
 * reading (the raw SMTP answer, the provider's message id), then the steps of
 * the happy path still to come, ghosted. A problem has no step to come.
 */
export function buildTimeline(
	events: SendEventRow[],
	send: TimelineSend,
): TimelineItem[] {
	const happened = happenedSteps(events, send)
	const reached = happened.map((step) => step.type)
	const queued = reached.includes('queued')
		? []
		: [stepOf(`queued-${send._id}`, 'queued', send.createdAt, send, NO_DETAIL)]
	return [...queued, ...happened, ...pendingSteps(send, reached)]
}
