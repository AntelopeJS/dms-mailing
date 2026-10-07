import type {
	TemplateRow,
	TemplateStats,
	TemplateStatus,
	VariableDefinition,
} from '../types/mailing'
import { localeBadges } from './locales'

/** A draft untouched for longer than this many days counts as stale. */
export const STALE_DRAFT_DAYS = 7

const MS_PER_DAY = 86_400_000

export type AttentionReason =
	'unpublished_draft' | 'stale_draft' | 'never_sent' | 'missing_locale'

export interface AttentionInput {
	row: TemplateRow
	/** Last 30 days of real sends; absent means none. */
	stats?: TemplateStats
	/** Workspace locale codes, in the workspace order. */
	workspaceLocales: string[]
	now: Date
}

type AttentionRule = (input: AttentionInput) => boolean

const isDraft = (row: TemplateRow) => row.status === 'draft'

/** Whole days between `date` and `now`; 0 for an unreadable date. */
export function daysSince(date: string | null | undefined, now: Date): number {
	const time = date ? new Date(date).getTime() : Number.NaN
	if (Number.isNaN(time)) return 0
	return Math.max(0, Math.floor((now.getTime() - time) / MS_PER_DAY))
}

const ATTENTION_RULES: Record<AttentionReason, AttentionRule> = {
	unpublished_draft: ({ row }) => isDraft(row) && !row.publishedVersion,
	stale_draft: ({ row, now }) =>
		isDraft(row) && daysSince(row.updatedAt, now) > STALE_DRAFT_DAYS,
	never_sent: ({ row, stats }) => row.status === 'live' && !stats?.sends,
	missing_locale: ({ row, workspaceLocales }) =>
		localeBadges(row.locales, workspaceLocales).some((badge) => !badge.present),
}

const ATTENTION_REASONS = Object.keys(ATTENTION_RULES) as AttentionReason[]

/**
 * Why a template needs a look, in a stable order: a draft never published or
 * untouched for a week, a live template no real send used in 30 days, a
 * workspace locale it lacks. Archived templates never need attention.
 */
export function attentionReasons(input: AttentionInput): AttentionReason[] {
	if (input.row.status === 'archived') return []
	return ATTENTION_REASONS.filter((reason) => ATTENTION_RULES[reason](input))
}

export function needsAttention(input: AttentionInput): boolean {
	return attentionReasons(input).length > 0
}

export type CardFooterKind = 'stats' | 'edited' | 'no_send'

/** Which line a card's footer reads, with the figures it needs. */
export interface CardFooter {
	kind: CardFooterKind
	sends: number
	openRate: number
	/** The date the line names: last edit, or the day it went live. */
	at: string
	by: string
}

/**
 * The footer of a gallery card: the 30-day figures once real sends exist,
 * otherwise who last edited a draft, or since when a live template waits for
 * its first send.
 */
export function cardFooter(
	row: TemplateRow,
	stats?: TemplateStats,
): CardFooter {
	const base = {
		sends: stats?.sends ?? 0,
		openRate: stats?.openRate ?? 0,
		at: row.updatedAt,
		by: row.updatedBy,
	}
	if (base.sends > 0) return { ...base, kind: 'stats' }
	if (row.status === 'live') {
		return { ...base, kind: 'no_send', at: row.publishedAt || row.updatedAt }
	}
	return { ...base, kind: 'edited' }
}

export type LifecycleAction = 'publish' | 'unpublish' | 'archive' | 'restore'

type TransitionRule = (row: TemplateRow) => LifecycleAction[]

/**
 * The backend refuses any other move with `409 invalid_transition`. On a live
 * template, publishing only makes sense when a draft waits.
 */
const TRANSITIONS: Record<TemplateStatus, TransitionRule> = {
	draft: () => ['publish', 'archive'],
	live: (row) =>
		row.isDraftPending
			? ['publish', 'unpublish', 'archive']
			: ['unpublish', 'archive'],
	archived: () => ['restore'],
}

/** The lifecycle moves a template accepts from its current status. */
export function validTransitions(row: TemplateRow): LifecycleAction[] {
	return TRANSITIONS[row.status]?.(row) ?? []
}

/** Reads a dotted path (`order.number`) off a data set. */
export function readPath(data: unknown, path: string): unknown {
	return path.split('.').reduce<unknown>((value, key) => {
		if (value === null || typeof value !== 'object') return undefined
		return (value as Record<string, unknown>)[key]
	}, data)
}

const isFilled = (value: unknown) =>
	value !== undefined && value !== null && value !== ''

/**
 * Whether the variables are ready for a real send: every path the content
 * uses is declared, and every required one has a test value.
 */
export function variablesCovered(
	declared: VariableDefinition[],
	detected: string[],
	testData: Record<string, unknown>,
): boolean {
	const declaredPaths = new Set(declared.map((entry) => entry.path))
	const everyUsedDeclared = detected.every((path) => declaredPaths.has(path))
	const everyRequiredFilled = declared
		.filter((entry) => entry.required)
		.every((entry) => isFilled(readPath(testData, entry.path)))
	return everyUsedDeclared && everyRequiredFilled
}
