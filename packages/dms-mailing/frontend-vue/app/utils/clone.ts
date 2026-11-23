import type { JsonValue } from './guards'

/**
 * A deep copy made of plain data, free of reactive proxies: what `JSON`
 * keeps of `value` is what the copy holds.
 */
export function deepClone<T>(value: T): T
export function deepClone(value: JsonValue | undefined) {
	const copy: unknown = JSON.parse(JSON.stringify(value))
	return copy
}
