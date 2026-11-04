import type { MailingTemplate } from "../db";
import type { TemplateChange } from "../engine";
import type {
  CategoryInLocale,
  TemplateContent,
  VariableDefinition,
} from "../types";
import type { JsonObject } from "../types/json";

export interface TemplateSender {
  name: string;
  email: string;
  replyTo: string;
}

export interface TemplateContentResponse {
  /** The template, its name in the reader's language. */
  template: MailingTemplate;
  /** The content the editor works on: the draft, else the published one. */
  content: TemplateContent;
  /** What customers receive; `null` when the template was never published. */
  publishedContent: TemplateContent | null;
  hasDraft: boolean;
  /** Version customers receive; 0 when never published. */
  version: number;
  /** The draft revision a save or a publish must carry back. */
  revision: number;
  changes: TemplateChange[];
  /** The declarations the editor works on: the draft's, else the published. */
  variables: VariableDefinition[];
  /** Paths the working content references, across every locale. */
  detectedVariables: string[];
  /**
   * The contract callers send against: the published declarations and the
   * paths the published content references; `null` when never published.
   */
  publishedVariables: VariableDefinition[] | null;
  publishedDetectedVariables: string[] | null;
  testData: JsonObject;
  fallbackLocale: string;
  /** Whether a send missing a variable fails rather than goes out blank. */
  blockOnMissingVariables: boolean;
  categories: CategoryInLocale[];
  sender: TemplateSender;
}
