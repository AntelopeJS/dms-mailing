import type { CellSubline } from "@antelopejs/interface-dms/base/table-view";

const FALLBACK_KEY = "$dms_mailing.sends.locale_fallback";

/** A locale code as the log shows it: `EN`. */
export function localeCode(locale: string | undefined): string {
  return (locale ?? "").toUpperCase();
}

/**
 * The line under a send's locale when the caller asked for another one
 * ("DE asked"), in the warning tone; `null` when the asked locale was used.
 */
export function localeFallbackSubline(
  locale: string | undefined,
  requestedLocale: string | undefined,
): CellSubline | null {
  if (!requestedLocale || requestedLocale === locale) return null;
  return {
    text: {
      key: FALLBACK_KEY,
      params: { requested: localeCode(requestedLocale) },
    },
    tone: "warning",
  };
}
