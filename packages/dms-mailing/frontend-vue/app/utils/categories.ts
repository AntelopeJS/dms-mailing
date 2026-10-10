import type { TemplateCategory } from '../types/mailing'

const ID_SEPARATOR = '-'

/**
 * Reads the category list off the settings form field, which stores it either
 * as the array or as the JSON string the DMS round-trips. Never throws: this
 * runs while rendering the field.
 */
export function parseCategories(
	value: TemplateCategory[] | string | null | undefined,
): TemplateCategory[] {
	if (Array.isArray(value)) return value
	if (!value) return []
	try {
		const parsed: unknown = JSON.parse(value)
		return Array.isArray(parsed) ? (parsed as TemplateCategory[]) : []
	} catch {
		return []
	}
}

export function serializeCategories(categories: TemplateCategory[]): string {
	return JSON.stringify(categories)
}

/** The value written back in the shape the field handed in (array or JSON). */
export function formatCategoriesLike(
	original: TemplateCategory[] | string | null | undefined,
	categories: TemplateCategory[],
): TemplateCategory[] | string {
	return Array.isArray(original) ? categories : serializeCategories(categories)
}

/** The icons the categories editor offers ("Pick an icon"). */
export const CATEGORY_ICONS = [
	'i-ph-package',
	'i-ph-lock',
	'i-ph-user-circle',
	'i-ph-key',
	'i-ph-file-text',
	'i-ph-newspaper',
	'i-ph-sparkle',
	'i-ph-textbox',
	'i-ph-truck',
	'i-ph-shopping-cart',
	'i-ph-bell',
	'i-ph-megaphone',
	'i-ph-gift',
	'i-ph-users',
	'i-ph-calendar',
	'i-ph-chat-circle',
]

export const DEFAULT_CATEGORY_ICON = 'i-ph-folder'

/**
 * A row of the categories editor. `isNew` rows were added in this edit: their
 * id follows the label until the form is saved, then stays fixed for good.
 */
export interface EditableCategory extends TemplateCategory {
	key: string
	isNew: boolean
}

const UNIQUE_SUFFIX_START = 2
const FALLBACK_ID_BASE = 'category'

/** `base`, or `base-2`, `base-3`… the first one `taken` does not hold. */
export function uniqueId(base: string, taken: Set<string>): string {
	if (!taken.has(base)) return base
	let suffix = UNIQUE_SUFFIX_START
	while (taken.has(`${base}${ID_SEPARATOR}${suffix}`)) suffix++
	return `${base}${ID_SEPARATOR}${suffix}`
}

/**
 * The categories an edit stores: rows without a label are left out (they are
 * not categories yet), saved rows keep their id, new rows get one derived from
 * their label, unique among the others.
 */
export function toStoredCategories(
	rows: EditableCategory[],
): TemplateCategory[] {
	const labelled = rows.filter((row) => row.label.trim())
	const taken = new Set(
		labelled.filter((row) => !row.isNew).map((row) => row.id),
	)
	return labelled.map((row) => {
		const id = row.isNew
			? uniqueId(slugifyId(row.label) || FALLBACK_ID_BASE, taken)
			: row.id
		taken.add(id)
		return {
			id,
			label: row.label.trim(),
			icon: row.icon || DEFAULT_CATEGORY_ICON,
		}
	})
}

/**
 * The id a new category gets from its label. Ids are stored on every template,
 * so they stay ASCII and stable rather than following a later rename.
 */
export function slugifyId(label: string): string {
	return label
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ID_SEPARATOR)
		.replace(/^-+|-+$/g, '')
}

/**
 * `USelect` is backed by Reka's `Select`, which reserves the empty string for
 * "nothing selected". An item carrying it makes the listbox refuse to open at
 * all — silently, with no console error. "No category" therefore travels as
 * this sentinel inside the widget and is mapped back on the way out.
 */
export const NO_CATEGORY = '__none__'

export function toCategoryOption(value: string | null | undefined): string {
	return value || NO_CATEGORY
}

export function fromCategoryOption(value: string): string {
	return value === NO_CATEGORY ? '' : value
}

/**
 * The category an edit stores. "No category" is sent as `null` rather than
 * omitted: from interface-data-api 0.2.0 on, the edit route leaves an absent
 * key unchanged, so only an explicit `null` clears it.
 */
export function toStoredCategory(
	value: string | null | undefined,
): string | null {
	return value || null
}
