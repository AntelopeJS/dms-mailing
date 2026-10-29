import type { IncomingHttpHeaders } from "node:http";
import type { RequestContext } from "@antelopejs/interface-api";
import {
  LOCALIZED_TEXT_FALLBACK_LOCALE,
  type LocalizedText,
} from "@antelopejs/interface-dms-mailing";
import { isText } from "../validation/guards";

/** Header the DMS frontend states the reader's language in on every request. */
export const CONTENT_LANGUAGE_HEADER = "x-content-language";

/**
 * The language to read localized texts in: the header's, else the one every
 * localized text falls back to.
 *
 * @param header Value of {@link CONTENT_LANGUAGE_HEADER}
 */
export function requestLocale(header: IncomingHttpHeaders[string]): string {
  return isText(header) && header.length > 0
    ? header
    : LOCALIZED_TEXT_FALLBACK_LOCALE;
}

/** The language a request reads and writes localized texts in. */
export function localeOfRequest(ctx: RequestContext): string {
  return requestLocale(ctx.rawRequest.headers[CONTENT_LANGUAGE_HEADER]);
}

/**
 * A localized text in `locale`, else in the fallback language, as
 * `@Localized({ fallbackLocale })` reads a table field.
 */
export function textIn(
  text: LocalizedText | undefined,
  locale: string,
): string {
  return text?.[locale] ?? text?.[LOCALIZED_TEXT_FALLBACK_LOCALE] ?? "";
}

/**
 * `text` with `value` written in `locale`. The fallback language gets the
 * same value while it has none, so a text first written in another language
 * still reads in every language.
 */
export function withTextIn(
  text: LocalizedText | undefined,
  locale: string,
  value: string,
): LocalizedText {
  return {
    [LOCALIZED_TEXT_FALLBACK_LOCALE]: value,
    ...text,
    [locale]: value,
  };
}
