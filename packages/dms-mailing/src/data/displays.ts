import {
  ColumnDisplay,
  RegisterDisplay,
} from "@antelopejs/interface-dms/base/table-view";

/**
 * A template's locale codes as mono chips, the workspace locales it lacks
 * drawn dashed in the warning tone.
 */
@RegisterDisplay("mailing:locale-chips")
export class LocaleChipsDisplay extends ColumnDisplay<Record<string, never>> {}

/**
 * A template's category as its settings label and icon, an id the settings
 * no longer declare shown as is.
 */
@RegisterDisplay("mailing:category")
export class CategoryDisplay extends ColumnDisplay<Record<string, never>> {}
