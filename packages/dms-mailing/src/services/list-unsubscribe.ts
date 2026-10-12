import { getPath, safeUrl, UNSUBSCRIBE_URL_PATH } from "../engine";

const LIST_UNSUBSCRIBE_HEADER = "List-Unsubscribe";
const LIST_UNSUBSCRIBE_POST_HEADER = "List-Unsubscribe-Post";
const ONE_CLICK_UNSUBSCRIBE = "List-Unsubscribe=One-Click";
const WEB_SCHEMES = ["http:", "https:"];
const ONE_CLICK_SCHEME = "https:";

const schemeOf = (url: string): string => {
  try {
    return new URL(url).protocol;
  } catch {
    return "";
  }
};

/**
 * The unsubscribe URL the caller passed, when it is an absolute web address a
 * mail client may call.
 */
export function unsubscribeUrlOf(variables: Record<string, unknown>): string {
  const value = getPath(variables, UNSUBSCRIBE_URL_PATH);
  if (typeof value !== "string") return "";
  const url = safeUrl(value.trim(), "");
  return WEB_SCHEMES.includes(schemeOf(url)) ? url : "";
}

/**
 * `List-Unsubscribe` (RFC 2369) lets the mail client offer its own
 * unsubscribe button; the one-click `List-Unsubscribe-Post` (RFC 8058) is
 * only announced over HTTPS, as the RFC requires. `EmailParams` has no
 * header field, so they travel in `providerOptions.headers`, which a provider
 * implementation reads to set them.
 */
export function unsubscribeHeaders(url: string): Record<string, string> {
  if (!url) return {};
  const headers: Record<string, string> = {
    [LIST_UNSUBSCRIBE_HEADER]: `<${url}>`,
  };
  if (schemeOf(url) === ONE_CLICK_SCHEME)
    headers[LIST_UNSUBSCRIBE_POST_HEADER] = ONE_CLICK_UNSUBSCRIBE;
  return headers;
}

/** The `providerOptions` of a message whose recipient can unsubscribe. */
export function unsubscribeProviderOptions(
  url: string,
): Record<string, unknown> | undefined {
  const headers = unsubscribeHeaders(url);
  return Object.keys(headers).length ? { headers } : undefined;
}
