import { HTTPResult } from "@antelopejs/interface-api";
import { HTTP_BAD_REQUEST } from "../constants";
import type { JsonValue } from "../types/json";
import { isText } from "../validation/guards";
import { parseJson } from "../validation/json";

const INVALID_BODY = "$dms_mailing.errors.invalid_body";

/** The JSON a request body carries, `{}` for an empty one; 400 when it is not JSON. */
export function parseBody(body: Buffer | string): JsonValue {
  const raw = isText(body) ? body : body.toString("utf8");
  if (!raw) return {};
  try {
    return parseJson(raw);
  } catch {
    throw new HTTPResult(HTTP_BAD_REQUEST, INVALID_BODY);
  }
}
