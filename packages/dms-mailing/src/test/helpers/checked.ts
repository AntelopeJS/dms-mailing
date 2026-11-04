import { z } from "zod";

/** A string, which the test needs an API answer's id, say, to be. */
export const checkedText = z.string();

/** A number, which the test needs a revision or a version to be. */
export const checkedNumber = z.number();

/** The part of an API answer a test reads, checked against its schema. */
export function parsedBody<Parsed>(
  response: { data: unknown },
  schema: z.ZodType<Parsed, z.ZodTypeDef, unknown>,
): Parsed {
  return schema.parse(response.data);
}

/** `value`, which the test needs to exist: a row a list must hold. */
export function checkedRow<Row>(value: Row | undefined): Row {
  if (value === undefined) throw new TypeError("expected a row, got none");
  return value;
}
