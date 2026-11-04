import type {
  TemplateVariables,
  TemplateVariableValue,
} from "@antelopejs/interface-dms-mailing";
import { isObject } from "../validation/guards";

const PATH_SEPARATOR = ".";
const ARRAY_SUFFIX = "[]";
const ARRAY_LENGTH = "length";
const ARRAY_INDEX = /^(?:0|[1-9]\d*)$/;

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

/** Whether a path can step into `value`: a record or a money value, not a list or a `Date`. */
export function isRecord(
  value: TemplateVariableValue | undefined,
): value is TemplateVariables {
  return isObject(value) && !Array.isArray(value) && !(value instanceof Date);
}

function readKey(record: TemplateVariables, key: string) {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function readSegment(
  current: TemplateVariableValue | undefined,
  segment: string,
): TemplateVariableValue | undefined {
  if (RESERVED_SEGMENTS.includes(segment)) return undefined;
  if (Array.isArray(current)) {
    if (segment === ARRAY_LENGTH) return current.length;
    return ARRAY_INDEX.test(segment) ? current[Number(segment)] : undefined;
  }
  return isRecord(current) ? readKey(current, segment) : undefined;
}

/**
 * The value `path` names in `data`: a key a record owns, a list's element by
 * index or its length. `undefined` when the path leaves the data.
 */
export function getPath(
  data: TemplateVariableValue | undefined,
  path: string,
): TemplateVariableValue | undefined {
  return normalizePath(path)
    .split(PATH_SEPARATOR)
    .reduce<TemplateVariableValue | undefined>(readSegment, data);
}

/** Whether `value` is neither missing nor `null`. */
export function isPresent(
  value: TemplateVariableValue | undefined,
): value is Exclude<TemplateVariableValue, null> {
  return value !== undefined && value !== null;
}
