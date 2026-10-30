/** A value as JSON carries it. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | JsonObject;

/** A JSON object: string keys, JSON values. */
export type JsonObject = { [key: string]: JsonValue };
