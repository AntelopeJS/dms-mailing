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

const MS_PER_HOUR = 3_600_000
const MS_PER_MINUTE = 60_000
const HOURS_PER_DAY = 24

/**
 * A date as a card reads it: "2 hr. ago" / "5 min. ago" within a day, "Sep 27"
 * after. Empty for an unreadable date.
 */
export function formatCardDate(
	date: string | null | undefined,
	now: Date,
	locale: string,
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
	return new Intl.DateTimeFormat(locale, {
		month: 'short',
		day: '2-digit',
	}).format(new Date(time))
}

/** The first word of a person's name ("Hugo Bernard" → "Hugo"). */
export function firstName(fullName: string | null | undefined): string {
	return (fullName ?? '').trim().split(/\s+/)[0] ?? ''
}
