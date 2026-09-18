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
