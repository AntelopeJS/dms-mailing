/** Mirrors the backend `SLUG_PATTERN`: what `SendTemplate(slug)` accepts. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/

export const MAX_SLUG_LENGTH = 64

export const MAX_NAME_LENGTH = 120

const SLUG_SEPARATOR = '-'

const FIRST_FREE_SUFFIX = 2

export type SlugIssue = 'required' | 'format' | 'too_long' | 'taken'

export type NameIssue = 'required' | 'too_long'

/**
 * The slug a name suggests: ASCII, lowercase, words joined by dashes, cut to
 * the maximum length without a trailing dash.
 */
export function slugify(name: string): string {
	return name
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, SLUG_SEPARATOR)
		.replace(/^-+|-+$/g, '')
		.slice(0, MAX_SLUG_LENGTH)
		.replace(/-+$/, '')
}

/**
 * What is wrong with a slug, or `null` when it can be created: present, in
 * the backend format, short enough and not used by another template.
 */
export function validateSlug(
	slug: string,
	takenSlugs: ReadonlySet<string>,
): SlugIssue | null {
	if (!slug) return 'required'
	if (slug.length > MAX_SLUG_LENGTH) return 'too_long'
	if (!SLUG_PATTERN.test(slug)) return 'format'
	return takenSlugs.has(slug) ? 'taken' : null
}

/** What is wrong with a template name, or `null` when it is fine. */
export function validateName(name: string): NameIssue | null {
	const trimmed = name.trim()
	if (!trimmed) return 'required'
	return trimmed.length > MAX_NAME_LENGTH ? 'too_long' : null
}

/**
 * The first free slug from `base`: itself, else `base-2`, `base-3`… so a
 * duplicate of "welcome (copy)" never starts out refused.
 */
export function freeSlug(
	base: string,
	takenSlugs: ReadonlySet<string>,
): string {
	if (!takenSlugs.has(base)) return base
	let suffix = FIRST_FREE_SUFFIX
	while (takenSlugs.has(`${base}${SLUG_SEPARATOR}${suffix}`)) suffix += 1
	return `${base}${SLUG_SEPARATOR}${suffix}`
}
