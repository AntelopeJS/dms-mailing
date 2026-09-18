import type { VariableDefinition, VariableType } from '../types/mailing'

/**
 * `declared` — the content uses it and someone typed it;
 * `detected` — the content uses it, nobody declared it;
 * `unused` — declared but the content no longer references it.
 */
export type VariableUsage = 'declared' | 'detected' | 'unused'

export interface MergedVariable {
	path: string
	type: VariableType
	required: boolean
	usage: VariableUsage
}

const DEFAULT_TYPE: VariableType = 'string'

/**
 * One list for the variables panel: every path the content references, in the
 * order it was detected, enriched by its declaration when there is one, then
 * the declarations the content has stopped using.
 */
export function mergeVariables(
	detected: string[],
	declared: VariableDefinition[],
): MergedVariable[] {
	const byPath = new Map(declared.map((entry) => [entry.path, entry]))
	const used = detected.map((path) => {
		const declaration = byPath.get(path)
		return {
			path,
			type: declaration?.type ?? DEFAULT_TYPE,
			required: declaration?.required ?? false,
			usage: declaration ? ('declared' as const) : ('detected' as const),
		}
	})
	const seen = new Set(detected)
	const unused = declared
		.filter((entry) => !seen.has(entry.path))
		.map((entry) => ({
			path: entry.path,
			type: entry.type,
			required: entry.required,
			usage: 'unused' as const,
		}))
	return [...used, ...unused]
}
