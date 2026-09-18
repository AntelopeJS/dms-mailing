import type { Block, LocaleContent, TemplateContent } from '../types/mailing'
import { splitTokens } from './tokens'

const TOKEN_FIELDS = ['text', 'value', 'href', 'label', 'alt', 'imageUrl']

function tokenPaths(block: Block): string[] {
	const record = block as unknown as Record<string, unknown>
	return TOKEN_FIELDS.flatMap((key) => {
		const value = record[key]
		if (typeof value !== 'string') return []
		return splitTokens(value)
			.filter((part) => part.kind === 'token')
			.map((part) => part.value)
	})
}

function branchPaths(block: Block): string[] {
	if (block.type === 'if') {
		return [
			block.condition.path,
			...pathsInBlocks(block.children),
			...pathsInBlocks(block.elseChildren ?? []),
		]
	}
	return block.type === 'list' ? [block.source] : []
}

export function pathsInBlocks(blocks: Block[]): string[] {
	return blocks.flatMap((block) => [
		...tokenPaths(block),
		...(block.visibleIf ? [block.visibleIf.path] : []),
		...branchPaths(block),
	])
}

export function collectPaths(
	declared: string[],
	blocks: Block[],
	current?: string,
): string[] {
	const all = [
		...declared,
		...pathsInBlocks(blocks),
		...(current ? [current] : []),
	]
	return [...new Set(all.filter(Boolean))].sort()
}

/**
 * Paths the runtime fills in itself, so an author never declares them. The
 * backend drops these before answering; this list mirrors it.
 */
const SYSTEM_PATHS = ['unsubscribeUrl', 'preferencesUrl']

function textPaths(text: string): string[] {
	return splitTokens(text)
		.filter((part) => part.kind === 'token')
		.map((part) => part.value)
}

function pathsInLocale(locale: LocaleContent): string[] {
	return [
		...textPaths(locale.subject),
		...textPaths(locale.preheader),
		...pathsInBlocks(locale.blocks),
	]
}

/**
 * Every variable path the content references, across all of its locales — the
 * live equivalent of what the backend returns as `detectedVariables`.
 *
 * The panel needs this because the server's list only refreshes on save: until
 * then a path wired into a display condition reads as unused, which is exactly
 * the moment an author looks at it.
 */
export function collectContentPaths(
	content: Pick<TemplateContent, 'locales'>,
): string[] {
	const paths = Object.values(content.locales ?? {}).flatMap(pathsInLocale)
	return [
		...new Set(paths.filter((path) => path && !SYSTEM_PATHS.includes(path))),
	].sort()
}
