import type { JsonObject, JsonValue } from "../types/json";
import { isNumber, isObject, isText } from "./guards";

/** A step of the walk in {@link isJsonValue}: visit a node, or leave one. */
type JsonWalkStep = { visit: unknown } | { leave: object };

/**
 * Whether `value` is wholly JSON data: strings, numbers, booleans, null, and
 * arrays and plain objects of the same, none of them reached through itself.
 * Walked with a stack, so a deeply nested value cannot overflow it.
 */
export function isJsonValue(value: unknown): value is JsonValue {
  const stack: JsonWalkStep[] = [{ visit: value }];
  const ancestors = new Set<object>();
  for (let step = stack.pop(); step; step = stack.pop()) {
    if ("leave" in step) {
      ancestors.delete(step.leave);
      continue;
    }
    const item = step.visit;
    if (
      item === null ||
      isText(item) ||
      isNumber(item) ||
      typeof item === "boolean"
    )
      continue;
    if (typeof item !== "object" || ancestors.has(item)) return false;
    const prototype: unknown = Object.getPrototypeOf(item);
    if (
      !Array.isArray(item) &&
      prototype !== Object.prototype &&
      prototype !== null
    )
      return false;
    ancestors.add(item);
    stack.push({ leave: item });
    for (const child of Object.values(item)) stack.push({ visit: child });
  }
  return true;
}

/** Whether `value` is wholly JSON data and an object: neither `null` nor an array. */
export function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    isJsonValue(value)
  );
}

/** `text` parsed as JSON; a `SyntaxError` when it is not. */
export function parseJson(text: string): JsonValue {
  const parsed: unknown = JSON.parse(text);
  if (!isJsonValue(parsed)) throw new TypeError("expected JSON data");
  return parsed;
}

/** `text` parsed as a JSON object. */
export function parseJsonObject(text: string): JsonObject {
  const parsed = parseJson(text);
  if (!isObject(parsed) || Array.isArray(parsed))
    throw new TypeError("expected a JSON object");
  return parsed;
}
