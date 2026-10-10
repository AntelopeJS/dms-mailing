import type { Block, LocaleContent, TemplateContent } from '../types/mailing'
import { splitTokens } from './tokens'

const TOKEN_FIELDS = ['text', 'value', 'href', 'label', 'alt', 'imageUrl']
const PATH_SEPARATOR = '.'
const ARRAY_SUFFIX = '[]'
const RESERVED_SEGMENTS = ['__proto__', 'constructor', 'prototype']

/**
 * Paths the runtime fills in itself, so an author never declares them. The
 * backend drops these before answering; this list mirrors it.
 */
export const SYSTEM_PATHS = ['unsubscribeUrl', 'preferencesUrl']

function tokenPaths(block: Block): string[] {
	const record = block as unknown as Record<string, unknown>
	return TOKEN_FIELDS.flatMap((key) => {
		const value = record[key]
		return typeof value === 'string' ? textPaths(value) : []
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

/** The variable paths a text references through `{{path}}` tokens. */
export function textPaths(text: string): string[] {
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
 */
export function collectContentPaths(
	content: Pick<TemplateContent, 'locales'>,
): string[] {
	const paths = Object.values(content.locales ?? {}).flatMap(pathsInLocale)
	return [
		...new Set(paths.filter((path) => path && !SYSTEM_PATHS.includes(path))),
	].sort()
}

function readSegment(current: unknown, segment: string): unknown {
	if (current === null || typeof current !== 'object') return undefined
	if (RESERVED_SEGMENTS.includes(segment)) return undefined
	return (current as Record<string, unknown>)[segment]
}

/**
 * Reads `path` (`order.total`, `order.lines[]`) in `data`, the way the backend
 * engine does; `undefined` when any segment is missing.
 */
export function readPath(data: unknown, path: string): unknown {
	const trimmed = path.trim()
	const normalized = trimmed.endsWith(ARRAY_SUFFIX)
		? trimmed.slice(0, -ARRAY_SUFFIX.length)
		: trimmed
	return normalized.split(PATH_SEPARATOR).reduce<unknown>(readSegment, data)
}

/** Whether `value` counts as provided: neither `undefined` nor `null`. */
export function isPresent(value: unknown): boolean {
	return value !== undefined && value !== null
}
