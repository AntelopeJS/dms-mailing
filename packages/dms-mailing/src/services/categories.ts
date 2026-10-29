import type { MailingTemplate } from "../db";
import type { CategoryInLocale, TemplateCategory } from "../types";
import type { CategoryEntry } from "../validation/settings.schema";
import { textIn } from "./localized-text";

/** The categories as a reader of `locale` sees them. */
export function categoriesIn(
  categories: TemplateCategory[],
  locale: string,
): CategoryInLocale[] {
  return categories.map(({ id, label, icon }) => ({
    id,
    label: textIn(label, locale),
    icon,
  }));
}

/** The categories a list keeps, without the removed ones it moves away. */
export function keptCategories(entries: CategoryEntry[]): TemplateCategory[] {
  return entries
    .filter((entry) => entry.moveTo === undefined)
    .map(({ id, label, icon }) => ({ id, label, icon }));
}

/** Where the templates of each removed category go, by its id. */
export function categoryMoves(entries: CategoryEntry[]): Map<string, string> {
  return new Map(
    entries.flatMap((entry) =>
      entry.moveTo === undefined ? [] : [[entry.id, entry.moveTo] as const],
    ),
  );
}

/** A template whose category has to change, and the one it gets. */
export interface CategoryReassignment {
  templateId: string;
  category: string;
}

/**
 * The templates whose category is not in `categories` any more, each with the
 * category it moves to: the one `moves` names, else none. Deleting a category
 * must never leave a template pointing at nothing.
 */
export function reassignRemovedCategories(
  templates: MailingTemplate[],
  categories: TemplateCategory[],
  moves: ReadonlyMap<string, string> = new Map(),
): CategoryReassignment[] {
  const kept = new Set(categories.map((category) => category.id));
  return templates.flatMap((template) => {
    const { category } = template;
    return category && !kept.has(category)
      ? [{ templateId: template._id, category: moves.get(category) ?? "" }]
      : [];
  });
}
