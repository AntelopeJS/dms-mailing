import { LOCALIZED_TEXT_FALLBACK_LOCALE } from "@antelopejs/interface-dms-mailing";
import { z } from "zod";
import { MAX_NAME_LENGTH } from "../constants";
import { sendEventTypeSchema } from "./send-event-type.schema";
import { categorySchema, settingsSchema } from "./settings.schema";
import {
  slugSchema,
  templateContentSchema,
  variableListSchema,
} from "./templates.schema";
import { jsonObjectSchema } from "./json.schema";

const MAX_AUTHOR_LENGTH = MAX_NAME_LENGTH;
const MAX_IMPORT_ID_LENGTH = 200;

const tenantIdSchema = z.string().trim().min(1);

/**
 * A name or a label declared from code: one non-blank text per language, the
 * fallback language's required, since every reader without a text of their
 * own reads it.
 */
export const localizedTextSchema = z
  .record(z.string().trim().min(1).max(MAX_NAME_LENGTH))
  .refine((text) => Boolean(text[LOCALIZED_TEXT_FALLBACK_LOCALE]), {
    message: `a text in "${LOCALIZED_TEXT_FALLBACK_LOCALE}" is required`,
  });

/**
 * A template declared from code: the slug and name rules of the dashboard's
 * creation, and the content and declarations its editor saves.
 */
export const templateDeclarationSchema = z.object({
  tenantId: tenantIdSchema,
  slug: slugSchema,
  name: localizedTextSchema,
  category: z.string().trim().default(""),
  content: templateContentSchema,
  variables: variableListSchema.default([]),
  testData: jsonObjectSchema.default({}),
  author: z.string().trim().min(1).max(MAX_AUTHOR_LENGTH).optional(),
});

export type ParsedTemplateDeclaration = z.infer<
  typeof templateDeclarationSchema
>;

export const categoryDeclarationSchema = categorySchema.extend({
  tenantId: tenantIdSchema,
  label: localizedTextSchema,
});

export type ParsedCategoryDeclaration = z.infer<
  typeof categoryDeclarationSchema
>;

const SENDER_REQUIRED = "a sender address is required";

/** A sender declared from code: the settings form's rules, an address required. */
export const senderDeclarationSchema = z.object({
  tenantId: tenantIdSchema,
  email: settingsSchema.shape.senderEmail.pipe(
    z.string().min(1, SENDER_REQUIRED),
  ),
  name: settingsSchema.shape.senderName.default(""),
  replyTo: settingsSchema.shape.replyTo.default(""),
});

export type ParsedSenderDeclaration = z.infer<typeof senderDeclarationSchema>;

const recipientSchema = z.union([
  z.string().trim().email(),
  z.object({
    email: z.string().trim().email(),
    name: z.string().optional(),
  }),
]);

const importedEventSchema = z.object({
  type: sendEventTypeSchema,
  at: z.coerce.date(),
  details: jsonObjectSchema.optional(),
});

const importedSendSchema = z.object({
  importId: z.string().trim().min(1).max(MAX_IMPORT_ID_LENGTH),
  templateSlug: slugSchema,
  to: recipientSchema,
  sentAt: z.coerce.date(),
  locale: z.string().trim().min(1).optional(),
  variables: jsonObjectSchema.default({}),
  provider: z.string().optional(),
  providerMessageId: z.string().optional(),
  source: z.string().optional(),
  isTest: z.boolean().default(false),
  events: z.array(importedEventSchema).default([]),
});

export type ParsedImportedSend = z.infer<typeof importedSendSchema>;

export const sendImportSchema = z.object({
  tenantId: tenantIdSchema,
  sends: z.array(importedSendSchema),
});
