import type { TemplateCategory } from '../types/mailing'

export interface CategoryGroup<T> {
	category: TemplateCategory
	items: T[]
}

export interface CategorizedRow {
	category?: string
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
