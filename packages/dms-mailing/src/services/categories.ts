import { z } from "zod";
import type { MailingTemplate } from "../db";
import type { TemplateCategory } from "../types";
import { categorySchema } from "../validation/settings.schema";

/** Direct API callers may send a JSON string; accept both string and array. */
const categoriesSchema = z
  .union([z.string(), z.array(categorySchema)])
  .transform((value) => {
    if (typeof value !== "string") return value;
    if (value === "") return [];
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  })
  .pipe(z.array(categorySchema));

export const CATEGORIES_SCHEMA = categoriesSchema;

/**
 * Reads a category list off a form field or an API body. Never throws on shape:
 * this runs while rendering a settings field.
 */
export function parseCategories(raw: unknown): TemplateCategory[] {
  const parsed = categoriesSchema.safeParse(raw ?? []);
  return parsed.success ? parsed.data : [];
}

/**
 * Ids of the templates whose category is not in `categories` any more. Deleting
 * a category must leave them uncategorised, never pointing at nothing.
 */
export function reassignRemovedCategories(
  templates: MailingTemplate[],
  categories: TemplateCategory[],
): string[] {
  const kept = new Set(categories.map((category) => category.id));
  return templates
    .filter((template) => template.category && !kept.has(template.category))
    .map((template) => template._id);
}
