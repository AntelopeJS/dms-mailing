import { HTTPResult } from "@antelopejs/interface-api";
import { HTTP_BAD_REQUEST } from "../constants";

const INVALID_BODY = "$dms_mailing.errors.invalid_body";

export function parseBody(body: Buffer | string): Record<string, unknown> {
  const raw = Buffer.isBuffer(body) ? body.toString("utf8") : body;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new HTTPResult(HTTP_BAD_REQUEST, INVALID_BODY);
  }
}
