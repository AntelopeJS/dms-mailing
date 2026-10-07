import {
  ColumnDisplay,
  RegisterDisplay,
} from "@antelopejs/interface-dms/base/table-view";

export interface LocaleFallbackDisplayOptions {
  /** Row field holding the locale the caller asked for. */
  requestedField: string;
}

/**
 * The locale a send was rendered in, as a mono chip; when it differs from the
 * one the caller asked for, the asked one leads with an arrow: `DE → EN`.
 */
@RegisterDisplay("mailing:locale-fallback")
export class LocaleFallbackDisplay extends ColumnDisplay<LocaleFallbackDisplayOptions> {}

/**
 * A template's locale codes as mono chips, the workspace locales it lacks
 * drawn dashed in the warning tone.
 */
@RegisterDisplay("mailing:locale-chips")
export class LocaleChipsDisplay extends ColumnDisplay<Record<string, never>> {}
