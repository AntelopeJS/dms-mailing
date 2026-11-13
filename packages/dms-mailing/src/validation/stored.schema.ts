import { z } from "zod";
import type { MailingTemplateVersion } from "../db/tables";
import type { TemplateChange, TemplateChangeKind } from "../engine/changes";
import type {
  Block,
  BlockType,
  Condition,
  ConditionOperator,
  TemplateCategory,
  TemplateContent,
  TextAlign,
  VariableDefinition,
  VariableType,
} from "../types";

/** What a stored JSON column holds, checked when it is read back. */
type StoredSchema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

/**
 * `text`, a stored JSON column, parsed and read with `schema`: a
 * `SyntaxError` when it is not JSON, a `TypeError` naming `what` when it does
 * not hold one, as `parseJsonObject` refuses.
 */
export function parseStored<T>(
  text: string,
  schema: StoredSchema<T>,
  what: string,
): T {
  const value: unknown = JSON.parse(text);
  const read = schema.safeParse(value);
  if (!read.success) throw new TypeError(`expected ${what}`);
  return read.data;
}

/** A string that is one of the keys of `members`, which lists every member. */
function oneOf<T extends string>(members: Record<T, true>): StoredSchema<T> {
  return z
    .string()
    .refine((value): value is T => Object.hasOwn(members, value));
}

const conditionOperators = {
  truthy: true,
  falsy: true,
  eq: true,
  ne: true,
  gt: true,
  lt: true,
} satisfies Record<ConditionOperator, true>;

const textAligns = {
  left: true,
  center: true,
  right: true,
} satisfies Record<TextAlign, true>;

const variableTypes = {
  string: true,
  text: true,
  number: true,
  money: true,
  date: true,
  url: true,
  boolean: true,
  array: true,
} satisfies Record<VariableType, true>;

const blockTypes = {
  hero: true,
  heading: true,
  paragraph: true,
  code: true,
  list: true,
  total: true,
  button: true,
  if: true,
  divider: true,
  footer: true,
} satisfies Record<BlockType, true>;

const changeKinds = {
  locale_added: true,
  locale_removed: true,
  subject: true,
  preheader: true,
  block_added: true,
  block_removed: true,
  block_changed: true,
  blocks_reordered: true,
  variable_added: true,
  variable_removed: true,
  variable_changed: true,
} satisfies Record<TemplateChangeKind, true>;

const storedConditionSchema: StoredSchema<Condition> = z
  .object({
    path: z.string(),
    operator: oneOf(conditionOperators),
    value: z.string(),
  })
  .passthrough();

const align = oneOf(textAligns);
const base = { id: z.string(), visibleIf: storedConditionSchema.nullable() };

/**
 * A block as the module stores it: the shape of {@link Block} and nothing
 * more, without the bounds an edit is held to, so every block the module
 * wrote reads back unchanged.
 */
const storedBlockSchema: StoredSchema<Block> = z.lazy(() => storedBlockUnion);

/** Built once: the lazy schema above returns it for every nested block. */
const storedBlockUnion = z.discriminatedUnion("type", [
  z
    .object({
      ...base,
      type: z.literal("hero"),
      imageUrl: z.string(),
      alt: z.string(),
    })
    .passthrough(),
  z
    .object({
      ...base,
      type: z.literal("heading"),
      text: z.string(),
      align,
      size: z.number(),
    })
    .passthrough(),
  z
    .object({
      ...base,
      type: z.literal("paragraph"),
      text: z.string(),
      align,
    })
    .passthrough(),
  z
    .object({ ...base, type: z.literal("code"), text: z.string() })
    .passthrough(),
  z
    .object({
      ...base,
      type: z.literal("list"),
      source: z.string(),
      labelPath: z.string(),
      valuePath: z.string(),
    })
    .passthrough(),
  z
    .object({
      ...base,
      type: z.literal("total"),
      label: z.string(),
      value: z.string(),
    })
    .passthrough(),
  z
    .object({
      ...base,
      type: z.literal("button"),
      text: z.string(),
      href: z.string(),
      align,
    })
    .passthrough(),
  z
    .object({
      ...base,
      type: z.literal("if"),
      condition: storedConditionSchema,
      children: z.array(storedBlockSchema),
      elseChildren: z.array(storedBlockSchema).nullable(),
    })
    .passthrough(),
  z.object({ ...base, type: z.literal("divider") }).passthrough(),
  z
    .object({
      ...base,
      type: z.literal("footer"),
      text: z.string(),
      unsubscribeLabel: z.string(),
      preferencesLabel: z.string(),
    })
    .passthrough(),
]);

/** Stored {@link TemplateContent}: `json_content`, `json_draft`, a version's. */
export const storedContentSchema: StoredSchema<TemplateContent> = z
  .object({
    locales: z.record(
      z
        .object({
          subject: z.string(),
          preheader: z.string(),
          blocks: z.array(storedBlockSchema),
        })
        .passthrough(),
    ),
  })
  .passthrough();

/** Stored declarations: `json_variables`, `json_variables_draft`, a version's. */
export const storedVariablesSchema: StoredSchema<VariableDefinition[]> =
  z.array(
    z
      .object({
        path: z.string(),
        type: oneOf(variableTypes),
        required: z.boolean(),
      })
      .passthrough(),
  );

/** A version's `json_changes`, as {@link TemplateChange} lists them. */
export const storedChangesSchema: StoredSchema<TemplateChange[]> = z.array(
  z
    .object({
      locale: z.string(),
      kind: oneOf(changeKinds),
      blockId: z.string().optional(),
      blockType: oneOf(blockTypes).optional(),
      variable: z.string().optional(),
    })
    .passthrough(),
);

/**
 * A template's `json_published_version`: the version row it inserts, whose
 * `publishedAt` JSON wrote as a string.
 */
export const storedVersionRowSchema: StoredSchema<MailingTemplateVersion> = z
  .object({
    _id: z.string(),
    templateId: z.string(),
    version: z.number(),
    json_content: z.string(),
    json_variables: z.string(),
    locales: z.string(),
    publishedAt: z.string().transform((at) => new Date(at)),
    publishedBy: z.string(),
    json_changes: z.string(),
  })
  .passthrough();

/** The settings' `json_categories`, each label one text per language. */
export const storedCategoriesSchema: StoredSchema<TemplateCategory[]> = z.array(
  z
    .object({
      id: z.string(),
      label: z.record(z.string()),
      icon: z.string(),
    })
    .passthrough(),
);
