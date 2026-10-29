/** Whether `value` is a string. */
export function isText(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Whether `value` is a JSON object as a parsed body holds one: an object,
 * neither `null` nor an array. Its values are not checked.
 */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether `value` is an object, arrays included, and not `null`: reading any
 * key of it yields a value of unknown type.
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Whether `value` is a number. */
export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}
