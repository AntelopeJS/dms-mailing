import { isNumber, isText } from "../../validation/guards";

/** `value`, which the test needs to be a string: an API answer's id, say. */
export function checkedText(value: unknown): string {
  if (!isText(value)) {
    throw new TypeError(`expected a string, got ${JSON.stringify(value)}`);
  }
  return value;
}

/** `value`, which the test needs to be a number: a revision, a version. */
export function checkedNumber(value: unknown): number {
  if (!isNumber(value)) {
    throw new TypeError(`expected a number, got ${JSON.stringify(value)}`);
  }
  return value;
}
