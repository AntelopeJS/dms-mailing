/** A JSON document: what the server stores and `JSON.parse` can answer. */
export type JsonValue =
	string | number | boolean | null | JsonValue[] | JsonObject

/** A JSON object, every value of it a {@link JsonValue}. */
export interface JsonObject {
	[key: string]: JsonValue
}

/** Whether `value` is a string. */
export function isString(value: unknown): value is string {
	return typeof value === 'string'
}

/** Whether `value` is a boolean. */
export function isBoolean(value: unknown): value is boolean {
	return typeof value === 'boolean'
}

/** Whether `value` is a scalar: anything but an object, a list or a function. */
export function isPrimitive(
	value: unknown,
): value is string | number | boolean | bigint | symbol | null | undefined {
	return (
		value === null || (typeof value !== 'object' && typeof value !== 'function')
	)
}

/** Whether `value` is a number. */
export function isNumber(value: unknown): value is number {
	return typeof value === 'number'
}

/** Whether `value` is an object that is not an array, whatever it holds. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether `value`, already typed as JSON, is an object rather than a list or a scalar. */
export function isJsonObject(
	value: JsonValue | undefined,
): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether `value` is JSON all the way down: scalars, lists and objects of them. */
export function isJsonValue(value: unknown): value is JsonValue {
	if (value === null) return true
	if (Array.isArray(value)) return value.every(isJsonValue)
	if (isRecord(value)) return Object.values(value).every(isJsonValue)
	return isString(value) || isNumber(value) || isBoolean(value)
}

/** Whether `value` is a JSON object all the way down. */
export function isJsonObjectValue(value: unknown): value is JsonObject {
	return isRecord(value) && isJsonValue(value)
}

/** What `table` holds under `key` itself: an inherited key such as `constructor` answers `undefined`. */
export function ownValue<V>(
	table: Record<string, V>,
	key: string,
): V | undefined {
	return Object.hasOwn(table, key) ? table[key] : undefined
}

/** The object `node` holds under `key`, created where the key is free or holds anything else. */
export function childObject(node: JsonObject, key: string): JsonObject {
	const child = ownValue(node, key)
	if (isJsonObject(child)) return child
	const created: JsonObject = {}
	node[key] = created
	return created
}

const OBJECT_TEXT = '[object Object]'

/** `value` as `String(value)` prints it: a list joins its items, an object is `[object Object]`. */
export function jsonText(value: JsonValue | undefined): string {
	if (Array.isArray(value))
		return value.map((item) => (item === null ? '' : jsonText(item))).join(',')
	return isJsonObject(value) ? OBJECT_TEXT : String(value)
}
