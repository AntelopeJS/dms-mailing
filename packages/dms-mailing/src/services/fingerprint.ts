import { createHash } from "node:crypto";

/** JSON with object keys sorted, so equal values always serialize alike. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => Number(left > right) - Number(left < right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * A short digest of `value` that ignores key order: what a declaration
 * remembers of what it wrote, to tell later whether a user changed it.
 */
export function fingerprintOf(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
