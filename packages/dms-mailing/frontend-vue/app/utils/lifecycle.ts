import type { TemplateStatus } from '../types/mailing'

export type LifecycleAction = 'unpublish' | 'archive' | 'restore'

export interface LifecycleButton {
	action: LifecycleAction
	icon: string
}

const BUTTONS: Record<LifecycleAction, LifecycleButton> = {
	unpublish: { action: 'unpublish', icon: 'i-ph-eye-slash' },
	archive: { action: 'archive', icon: 'i-ph-archive' },
	restore: { action: 'restore', icon: 'i-ph-arrow-u-up-left' },
}

const TRANSITIONS: Record<TemplateStatus, LifecycleAction[]> = {
	draft: ['archive'],
	live: ['unpublish', 'archive'],
	archived: ['restore'],
}

export function lifecycleActions(status: TemplateStatus): LifecycleButton[] {
	return (TRANSITIONS[status] ?? []).map((action) => BUTTONS[action])
}

/** Publishing is refused from `archived`; restore the template first. */
export function canPublish(status: TemplateStatus): boolean {
	return status !== 'archived'
}

export type NoticeKind =
	'live_changes' | 'live_clean' | 'never_published' | 'draft_changes'

/** The cyan band under the toolbar: what it says and which actions it has. */
export interface EditorNotice {
	kind: NoticeKind
	canCompare: boolean
	canDiscard: boolean
}

export interface NoticeInput {
	status: TemplateStatus
	version: number
	changeCount: number
}

const notice = (kind: NoticeKind, hasActions: boolean): EditorNotice => ({
	kind,
	canCompare: hasActions,
	canDiscard: hasActions,
})

/**
 * Which notice the editor shows: none for a clean template that is not live,
 * a "nothing published yet" one before v1, else the live / draft readings.
 */
export function noticeFor(input: NoticeInput): EditorNotice | null {
	const hasChanges = input.changeCount > 0
	if (input.version === 0)
		return hasChanges ? notice('never_published', false) : null
	if (input.status === 'live')
		return hasChanges
			? notice('live_changes', true)
			: notice('live_clean', false)
	return hasChanges ? notice('draft_changes', true) : null
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
	month: 'short',
	day: 'numeric',
}
const TIME_FORMAT: Intl.DateTimeFormatOptions = {
	hour: '2-digit',
	minute: '2-digit',
	hour12: false,
}

/** A publication moment, split for "published Sep 29 at 09:14". */
export interface PublishedMoment {
	date: string
	time: string
}

export function publishedMoment(
	iso: string | null | undefined,
	locale: string,
): PublishedMoment | null {
	if (!iso) return null
	const date = new Date(iso)
	if (Number.isNaN(date.getTime())) return null
	return {
		date: date.toLocaleDateString(locale, DATE_FORMAT),
		time: date.toLocaleTimeString(locale, TIME_FORMAT),
	}
}

/** The subject length mail clients show in full; past it, a warning tint. */
export const SUBJECT_RECOMMENDED_LENGTH = 60
