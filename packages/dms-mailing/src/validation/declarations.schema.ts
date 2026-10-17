import { z } from "zod";
import { MAX_NAME_LENGTH } from "../constants";
import { SEND_EVENT_TYPES } from "../types";
import { categorySchema, settingsSchema } from "./settings.schema";
import {
  slugSchema,
  templateContentSchema,
  variableListSchema,
} from "./templates.schema";

const MAX_AUTHOR_LENGTH = MAX_NAME_LENGTH;
const MAX_IMPORT_ID_LENGTH = 200;

const tenantIdSchema = z.string().trim().min(1);

/**
 * A template declared from code: the slug and name rules of the dashboard's
 * creation, and the content and declarations its editor saves.
 */
export const templateDeclarationSchema = z.object({
  tenantId: tenantIdSchema,
  slug: slugSchema,
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  category: z.string().trim().default(""),
  content: templateContentSchema,
  variables: variableListSchema.default([]),
  testData: z.record(z.unknown()).default({}),
  author: z.string().trim().min(1).max(MAX_AUTHOR_LENGTH).optional(),
});

export type ParsedTemplateDeclaration = z.infer<
  typeof templateDeclarationSchema
>;

export const categoryDeclarationSchema = categorySchema.extend({
  tenantId: tenantIdSchema,
  label: z.string().trim().min(1).max(MAX_NAME_LENGTH),
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
  type: z.enum(SEND_EVENT_TYPES as [string, ...string[]]),
  at: z.coerce.date(),
  details: z.record(z.unknown()).optional(),
});

const importedSendSchema = z.object({
  importId: z.string().trim().min(1).max(MAX_IMPORT_ID_LENGTH),
  templateSlug: slugSchema,
  to: recipientSchema,
  sentAt: z.coerce.date(),
  locale: z.string().trim().min(1).optional(),
  variables: z.record(z.unknown()).default({}),
  provider: z.string().optional(),
  providerMessageId: z.string().optional(),
  source: z.string().optional(),
  isTest: z.boolean().default(false),
  events: z.array(importedEventSchema).default([]),
});

export type ParsedImportedSend = z.infer<typeof importedSendSchema>;

const REPLACE_WITHOUT_SCOPE = "a replacing import needs a scope";

export const sendImportSchema = z
  .object({
    tenantId: tenantIdSchema,
    scope: z.string().trim().min(1).max(MAX_IMPORT_ID_LENGTH).optional(),
    replace: z.boolean().default(false),
    sends: z.array(importedSendSchema),
  })
  .refine((input) => !input.replace || input.scope, {
    message: REPLACE_WITHOUT_SCOPE,
    path: ["scope"],
  });

export type ParsedSendImport = z.infer<typeof sendImportSchema>;
