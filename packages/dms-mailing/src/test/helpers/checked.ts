import { z } from "zod";

/** A string, which the test needs an API answer's id, say, to be. */
export const checkedText = z.string();

/** A number, which the test needs a revision or a version to be. */
export const checkedNumber = z.number();

/** `value`, which the test needs to exist: a row a list must hold. */
export function checkedRow<Row>(value: Row | undefined): Row {
  if (value === undefined) throw new TypeError("expected a row, got none");
  return value;
}
