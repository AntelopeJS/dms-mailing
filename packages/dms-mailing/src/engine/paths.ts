const PATH_SEPARATOR = ".";
const ARRAY_SUFFIX = "[]";

export function normalizePath(path: string): string {
  const trimmed = path.trim();
  return trimmed.endsWith(ARRAY_SUFFIX)
    ? trimmed.slice(0, -ARRAY_SUFFIX.length)
    : trimmed;
}

/**
 * Segments that would leave the data and walk the prototype chain. A path is
 * authored rather than recipient-supplied, but `{{constructor}}` still resolved
 * to the Object constructor and stringified its source into the e-mail.
 */
const RESERVED_SEGMENTS = ["__proto__", "constructor", "prototype"];

function readSegment(current: unknown, segment: string): unknown {
  if (current === null || current === undefined) return undefined;
  if (typeof current !== "object") return undefined;
  if (RESERVED_SEGMENTS.includes(segment)) return undefined;
  return (current as Record<string, unknown>)[segment];
}

export function getPath(data: unknown, path: string): unknown {
  return normalizePath(path)
    .split(PATH_SEPARATOR)
    .reduce<unknown>(readSegment, data);
}

export function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null;
}
