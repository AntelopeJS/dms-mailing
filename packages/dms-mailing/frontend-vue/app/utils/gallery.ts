import type { TemplateCategory } from '../types/mailing'

export interface CategoryGroup<T> {
	category: TemplateCategory
	items: T[]
}

export interface CategorizedRow {
	category?: string | null
}

export const UNCATEGORISED_GROUP_ID = 'uncategorised'

const UNCATEGORISED_ICON = 'i-ph-folder-dashed'

/**
 * Groups template rows by the categories declared in the settings, keeping the
 * declared order. Rows with no category, or one the settings no longer declare,
 * land in a trailing group the caller labels — it is the only heading here that
 * needs translating. Empty groups are dropped.
 */
export function groupByCategory<T extends CategorizedRow>(
	rows: T[],
	categories: TemplateCategory[],
	uncategorisedLabel: string,
): CategoryGroup<T>[] {
	const known = categories.map((category) => ({
		category,
		items: rows.filter((row) => row.category === category.id),
	}))
	const knownIds = new Set(categories.map((category) => category.id))
	const uncategorised = {
		category: {
			id: UNCATEGORISED_GROUP_ID,
			label: uncategorisedLabel,
			icon: UNCATEGORISED_ICON,
		},
		items: rows.filter((row) => !row.category || !knownIds.has(row.category)),
	}
	return [...known, uncategorised].filter((group) => group.items.length > 0)
}

/** The slice of the DMS `TableViewDisplayPagination` the gallery reads. */
export interface GalleryPagination {
	pageIndex: number
	pageSize: number
	total: number
	setPage: (index: number) => void
	mode?: string
	hasMore?: boolean
	loadMore?: () => void
}

/** The slice of the DMS `TableViewDisplayActions` the gallery reads. */
export interface GalleryActions<T> {
	open: (item: T) => void
}

/** The slice of the TanStack table the gallery reaches for its reset. */
export interface GalleryTable {
	setGlobalFilter: (value: string) => void
}

/**
 * The slice of the DMS `TableViewDisplayContext` the gallery display reads,
 * declared structurally: the layer does not import from the dms-ui layer.
 */
export interface GalleryContext<T> {
	items: T[]
	loading: boolean
	pagination: GalleryPagination
	actions?: GalleryActions<T>
	/** Active filters, search and sort of the table, without paging. */
	query?: Record<string, unknown>
	refresh: () => Promise<void> | void
	table?: GalleryTable
}

const SEARCH_KEY = 'search'
const FILTER_PREFIX = 'filter_'
/** The status tabs filter on this column: a tab is not a user filter. */
const TAB_FILTER_KEY = `${FILTER_PREFIX}status`

/** The search typed in the table, trimmed; empty without one. */
export function searchTermOf(
	query: Record<string, unknown> | undefined,
): string {
	const value = query?.[SEARCH_KEY]
	return typeof value === 'string' ? value.trim() : ''
}

/** The filters the user set (quick filters, filter rows), not the tab. */
export function userFilterKeys(
	query: Record<string, unknown> | undefined,
): string[] {
	return Object.keys(query ?? {}).filter(
		(key) => key.startsWith(FILTER_PREFIX) && key !== TAB_FILTER_KEY,
	)
}

/** Whether a search or a filter narrows what the gallery lists. */
export function isNarrowed(
	query: Record<string, unknown> | undefined,
): boolean {
	return Boolean(searchTermOf(query)) || userFilterKeys(query).length > 0
}

type FilterMatcher = (cell: string, value: string) => boolean

const FILTER_MATCHERS: Record<string, FilterMatcher> = {
	is: (cell, value) => cell === value,
	is_not: (cell, value) => cell !== value,
	is_empty: (cell) => !cell,
	is_not_empty: (cell) => Boolean(cell),
}

const FILTER_MODE_SEPARATOR = ':'

const cellOf = (row: object, field: string) =>
	String((row as Record<string, unknown>)[field] ?? '')

function matchesFilter(row: object, key: string, filter: unknown): boolean {
	if (typeof filter !== 'string') return true
	const at = filter.indexOf(FILTER_MODE_SEPARATOR)
	const mode = at < 0 ? filter : filter.slice(0, at)
	const matcher = FILTER_MATCHERS[mode]
	if (!matcher) return true
	const value = at < 0 ? '' : filter.slice(at + 1)
	return matcher(cellOf(row, key.slice(FILTER_PREFIX.length)), value)
}

/**
 * Whether a row passes the table's query (the tab, the quick filters and the
 * search over `searchFields`), checked in the browser over rows listed
 * without it. A filter mode it does not know lets the row through.
 */
export function matchesQuery(
	row: object,
	query: Record<string, unknown> | undefined,
	searchFields: string[],
): boolean {
	const filters = Object.entries(query ?? {}).filter(([key]) =>
		key.startsWith(FILTER_PREFIX),
	)
	if (!filters.every(([key, value]) => matchesFilter(row, key, value))) {
		return false
	}
	const search = searchTermOf(query).toLowerCase()
	return (
		!search ||
		searchFields.some((field) =>
			cellOf(row, field).toLowerCase().includes(search),
		)
	)
}

const SORT_KEY = 'sortKey'
const SORT_DIRECTION_KEY = 'sortDirection'
const DESCENDING = 'desc'

/** The table's sort column; absent without one. */
export function sortKeyOf(
	query: Record<string, unknown> | undefined,
): string | undefined {
	const key = query?.[SORT_KEY]
	return typeof key === 'string' && key ? key : undefined
}

/** Rows ordered like the table's query orders them, the list left untouched. */
export function sortLikeQuery<T extends object>(
	rows: T[],
	query: Record<string, unknown> | undefined,
): T[] {
	const key = sortKeyOf(query)
	if (!key) return rows
	const direction = query?.[SORT_DIRECTION_KEY] === DESCENDING ? -1 : 1
	return [...rows].sort(
		(left, right) =>
			direction * cellOf(left, key).localeCompare(cellOf(right, key)),
	)
}

const MS_PER_HOUR = 3_600_000
const MS_PER_MINUTE = 60_000
const HOURS_PER_DAY = 24

/** Words a sentence puts around an absolute date ("le 27 sept." in French). */
export type OnDate = (date: string) => string

const bareDate: OnDate = (date) => date

/**
 * A date as a card reads it: "2 hr. ago" / "5 min. ago" within a day, "Sep 27"
 * after. `onDate` dresses the absolute one only, so a sentence written around
 * it ("Edited {date}") reads right in both cases. Empty for an unreadable date.
 */
export function formatCardDate(
	date: string | null | undefined,
	now: Date,
	locale: string,
	onDate: OnDate = bareDate,
): string {
	const time = date ? new Date(date).getTime() : Number.NaN
	if (Number.isNaN(time)) return ''
	const elapsed = Math.max(0, now.getTime() - time)
	const relative = new Intl.RelativeTimeFormat(locale, {
		numeric: 'auto',
		style: 'short',
	})
	if (elapsed < MS_PER_HOUR) {
		return relative.format(-Math.round(elapsed / MS_PER_MINUTE), 'minute')
	}
	if (elapsed < HOURS_PER_DAY * MS_PER_HOUR) {
		return relative.format(-Math.round(elapsed / MS_PER_HOUR), 'hour')
	}
	return onDate(
		new Intl.DateTimeFormat(locale, {
			month: 'short',
			day: '2-digit',
		}).format(new Date(time)),
	)
}

/**
 * How long ago `date` was, the way "live since…" reads it: a duration within a
 * day ("1 hr", "5 min"; "1 h" in French), the date after ("Sep 27"). `null`
 * for an unreadable date.
 */
export interface CardSince {
	kind: 'duration' | 'date'
	text: string
}

export function formatCardSince(
	date: string | null | undefined,
	now: Date,
	locale: string,
): CardSince | null {
	const time = date ? new Date(date).getTime() : Number.NaN
	if (Number.isNaN(time)) return null
	const elapsed = Math.max(0, now.getTime() - time)
	if (elapsed >= HOURS_PER_DAY * MS_PER_HOUR)
		return { kind: 'date', text: formatCardDate(date, now, locale) }
	const isHours = elapsed >= MS_PER_HOUR
	const amount = Math.max(
		1,
		Math.round(elapsed / (isHours ? MS_PER_HOUR : MS_PER_MINUTE)),
	)
	const text = new Intl.NumberFormat(locale, {
		style: 'unit',
		unit: isHours ? 'hour' : 'minute',
		unitDisplay: 'short',
	}).format(amount)
	return { kind: 'duration', text }
}

/** The first word of a person's name ("Hugo Bernard" → "Hugo"). */
export function firstName(fullName: string | null | undefined): string {
	return (fullName ?? '').trim().split(/\s+/)[0] ?? ''
}
