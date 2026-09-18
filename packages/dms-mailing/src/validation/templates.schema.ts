import { z } from "zod";
import { MAX_NAME_LENGTH, MAX_SLUG_LENGTH, SLUG_PATTERN } from "../constants";

const MIN_HEADING_SIZE = 12;
const MAX_HEADING_SIZE = 48;
const MAX_TEST_RECIPIENT_COUNT = 5;

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_SLUG_LENGTH)
  .regex(SLUG_PATTERN);

export const createTemplateSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  category: z.string().optional(),
  /** Absent or empty starts blank; otherwise the template to copy. */
  sourceTemplateId: z.string().optional(),
});

export const conditionSchema = z.object({
  path: z.string().min(1),
  operator: z.enum(["truthy", "falsy", "eq", "ne", "gt", "lt"]),
  value: z.string(),
});

const alignSchema = z.enum(["left", "center", "right"]);
const base = { id: z.string().min(1), visibleIf: conditionSchema.nullable() };

export const blockSchema: z.ZodType<unknown> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      ...base,
      type: z.literal("hero"),
      imageUrl: z.string(),
      alt: z.string(),
    }),
    z.object({
      ...base,
      type: z.literal("heading"),
      text: z.string(),
      align: alignSchema,
      size: z.number().int().min(MIN_HEADING_SIZE).max(MAX_HEADING_SIZE),
    }),
    z.object({
      ...base,
      type: z.literal("paragraph"),
      text: z.string(),
      align: alignSchema,
    }),
    z.object({ ...base, type: z.literal("code"), text: z.string() }),
    z.object({
      ...base,
      type: z.literal("list"),
      source: z.string().min(1),
      labelPath: z.string().min(1),
      valuePath: z.string().min(1),
    }),
    z.object({
      ...base,
      type: z.literal("total"),
      label: z.string(),
      value: z.string(),
    }),
    z.object({
      ...base,
      type: z.literal("button"),
      text: z.string(),
      href: z.string(),
      align: alignSchema,
    }),
    z.object({
      ...base,
      type: z.literal("if"),
      condition: conditionSchema,
      children: z.array(blockSchema),
      elseChildren: z.array(blockSchema).nullable(),
    }),
    z.object({ ...base, type: z.literal("divider") }),
    z.object({
      ...base,
      type: z.literal("footer"),
      text: z.string(),
      unsubscribeLabel: z.string(),
      preferencesLabel: z.string(),
    }),
  ]),
);

export const localeContentSchema = z.object({
  subject: z.string(),
  preheader: z.string(),
  blocks: z.array(blockSchema),
});

export const templateContentSchema = z.object({
  locales: z.record(localeContentSchema),
});

export const variableSchema = z.object({
  path: z.string().min(1),
  type: z.enum([
    "string",
    "text",
    "number",
    "money",
    "date",
    "url",
    "boolean",
    "array",
  ]),
  required: z.boolean(),
});

export const variablesSchema = z.object({ variables: z.array(variableSchema) });

export const testDataSchema = z.object({ data: z.record(z.unknown()) });

export const previewSchema = z.object({
  /** Absent lets the server pick the tenant fallback (see `pickLocale`). */
  locale: z.string().min(1).optional(),
  content: templateContentSchema.optional(),
  data: z.record(z.unknown()).optional(),
});

/**
 * A real send always uses the saved template: unlike a test send it takes no
 * `content` override, so what goes out is what is published.
 */
export const realSendSchema = z.object({
  to: z.array(z.string().email()).min(1).max(MAX_TEST_RECIPIENT_COUNT),
  locale: z.string().min(1).optional(),
  data: z.record(z.unknown()).optional(),
});

export const testSendSchema = previewSchema.extend({
  to: z.array(z.string().email()).min(1).max(MAX_TEST_RECIPIENT_COUNT),
});

export const duplicateSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
});
