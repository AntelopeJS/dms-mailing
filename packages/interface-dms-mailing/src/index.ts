import { InterfaceFunction } from "@antelopejs/interface-core";
import type { EmailAddress } from "@antelopejs/interface-email";

export type ConditionOperator = "truthy" | "falsy" | "eq" | "ne" | "gt" | "lt";

export interface Condition {
  path: string;
  operator: ConditionOperator;
  value: string;
}

export type TextAlign = "left" | "center" | "right";

export type BlockType =
  | "hero"
  | "heading"
  | "paragraph"
  | "code"
  | "list"
  | "total"
  | "button"
  | "if"
  | "divider"
  | "footer";

export interface BlockBase {
  id: string;
  type: BlockType;
  visibleIf: Condition | null;
}

export interface HeroBlock extends BlockBase {
  type: "hero";
  imageUrl: string;
  alt: string;
}

export interface HeadingBlock extends BlockBase {
  type: "heading";
  text: string;
  align: TextAlign;
  size: number;
}

export interface ParagraphBlock extends BlockBase {
  type: "paragraph";
  text: string;
  align: TextAlign;
}

export interface CodeBlock extends BlockBase {
  type: "code";
  text: string;
}

export interface ListBlock extends BlockBase {
  type: "list";
  source: string;
  labelPath: string;
  valuePath: string;
}

export interface TotalBlock extends BlockBase {
  type: "total";
  label: string;
  value: string;
}

export interface ButtonBlock extends BlockBase {
  type: "button";
  text: string;
  href: string;
  align: TextAlign;
}

export interface IfBlock extends BlockBase {
  type: "if";
  condition: Condition;
  children: Block[];
  elseChildren: Block[] | null;
}

export interface DividerBlock extends BlockBase {
  type: "divider";
}

export interface FooterBlock extends BlockBase {
  type: "footer";
  text: string;
  unsubscribeLabel: string;
  preferencesLabel: string;
}

export type Block =
  | HeroBlock
  | HeadingBlock
  | ParagraphBlock
  | CodeBlock
  | ListBlock
  | TotalBlock
  | ButtonBlock
  | IfBlock
  | DividerBlock
  | FooterBlock;

export interface LocaleContent {
  subject: string;
  preheader: string;
  blocks: Block[];
}

export interface TemplateContent {
  locales: Record<string, LocaleContent>;
}

export type VariableType =
  | "string"
  | "text"
  | "number"
  | "money"
  | "date"
  | "url"
  | "boolean"
  | "array";

export interface VariableDefinition {
  path: string;
  type: VariableType;
  required: boolean;
}

/** Parameters of a template send triggered from application code. */
export interface SendTemplateParams {
  tenantId: string;
  to: EmailAddress | EmailAddress[];
  locale?: string;
  variables?: Record<string, unknown>;
  content?: TemplateContent;
  source?: string;
  isTest?: boolean;
}

/**
 * Outcome of a template send.
 *
 * For a single recipient the fields describe that one message. For several
 * recipients they describe the call as a whole: `sendId` and `messageId` stay
 * those of the first recipient, `status` degrades to the worst outcome and
 * `error` carries the first failure.
 */
export interface SendTemplateResult {
  sendId: string;
  status: SendStatus;
  messageId?: string;
  error?: string;
  /**
   * One entry per recipient, in the order they were given. Absent on the
   * per-recipient entries themselves.
   */
  results?: SendTemplateResult[];
}

/**
 * Delivery event reported by an e-mail provider webhook. A hard `bounced`, a
 * `spam` complaint or an `unsubscribed` event puts the address on the
 * tenant's suppression list.
 */
export interface EmailEvent {
  provider: string;
  messageId: string;
  type: SendEventType;
  at?: Date;
  details?: Record<string, unknown>;
}

export type SendEventType =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "spam"
  | "failed"
  | "unsubscribed";

/**
 * Where a send stands. `suppressed` never comes from a provider: the address
 * is on the tenant's suppression list (a hard bounce, a spam complaint, an
 * unsubscription or a manual entry), so nothing was sent to it.
 */
export type SendStatus = SendEventType | "suppressed";

/**
 * Renders a live template and sends it to the given recipients. A recipient
 * on the suppression list gets no e-mail: its entry in `results` says
 * `suppressed`.
 */
export const SendTemplate =
  InterfaceFunction<
    (slug: string, params: SendTemplateParams) => Promise<SendTemplateResult>
  >();

/** Records a provider event against the send it belongs to. */
export const RecordEmailEvent =
  InterfaceFunction<
    (tenantId: string, event: EmailEvent) => Promise<boolean>
  >();

/**
 * A template a project ships as code. `slug` is the stable key the caller
 * chooses: declaring it again never creates a second template.
 */
export interface TemplateDeclaration {
  /** Workspace the template belongs to; the default tenant when absent. */
  tenantId?: string;
  slug: string;
  name: string;
  /** A category id the workspace settings declare; none when absent. */
  category?: string;
  /** What customers receive, per locale. Every locale needs a subject. */
  content: TemplateContent;
  /** The variables callers send, checked like the editor's declarations. */
  variables?: VariableDefinition[];
  /** The data set the editor's preview and test send use. */
  testData?: Record<string, unknown>;
  /** Shown as the author of what the declaration writes; `system` when absent. */
  author?: string;
}

/**
 * What a declaration did:
 *
 * - `created`: the slug was free, the template now exists and is live (v1).
 * - `updated`: the declaration changed since the last call and the template
 *   was still exactly as last declared, so the new one was published.
 * - `unchanged`: the declaration is the one already applied; nothing written.
 * - `kept`: the declaration changed but the template was edited, unpublished,
 *   archived or holds a draft since (or was made in the dashboard under that
 *   slug), so it was left as it is.
 */
export type DeclarationOutcome = "created" | "updated" | "unchanged" | "kept";

export interface DeclareTemplateResult {
  templateId: string;
  slug: string;
  outcome: DeclarationOutcome;
  /** Version customers receive after the call; 0 when never published. */
  version: number;
}

/** A template category a project ships as code, keyed by its `id`. */
export interface TemplateCategoryDeclaration {
  /** Workspace the category belongs to; the default tenant when absent. */
  tenantId?: string;
  id: string;
  label: string;
  /** A Phosphor icon name, such as `i-ph-tag`. */
  icon: string;
}

export interface DeclareTemplateCategoryResult {
  id: string;
  outcome: DeclarationOutcome;
}

/**
 * A provider event of an imported send. Its `at` is kept as given: the
 * timeline and the metrics read it.
 */
export interface ImportedSendEvent {
  type: SendEventType;
  at: Date;
  details?: Record<string, unknown>;
}

/**
 * A send that happened elsewhere (another provider, a demo data set), written
 * into the send log as it was. `importId` is the stable key the caller
 * chooses: importing it again never creates a second send.
 */
export interface ImportedSend {
  importId: string;
  /** A template of the workspace; its published version is recorded. */
  templateSlug: string;
  to: EmailAddress;
  /** When it was sent: the send's date in the log and in every metric. */
  sentAt: Date;
  /** Locale it was sent in; the workspace fallback locale when absent. */
  locale?: string;
  variables?: Record<string, unknown>;
  provider?: string;
  providerMessageId?: string;
  /** Labels the send log; `import` when absent. */
  source?: string;
  isTest?: boolean;
  /**
   * What happened to it, in any order. The send's status, counters and
   * error follow from them as if a webhook had reported them; without any,
   * the send is `sent`.
   */
  events?: ImportedSendEvent[];
}

export interface SendImport {
  /** Workspace the sends belong to; the default tenant when absent. */
  tenantId?: string;
  sends: ImportedSend[];
}

export interface ImportSendsResult {
  /** Sends written by this call. */
  imported: number;
  /** Sends whose `importId` was already imported, left untouched. */
  skipped: number;
  /** The send id of every entry, in the order given. */
  sendIds: string[];
}

/**
 * Creates or refreshes a template from code, published so `SendTemplate` can
 * use it at once. Idempotent on `slug`, and never overwrites what a user
 * changed since the last declaration: see {@link DeclarationOutcome}. Waits
 * for the module and its database when called early.
 */
export const DeclareTemplate =
  InterfaceFunction<
    (declaration: TemplateDeclaration) => Promise<DeclareTemplateResult>
  >();

/**
 * Adds a template category to the workspace settings from code. Idempotent
 * on `id`; a category a user relabelled or removed since is left as it is.
 * Waits for the module and its database when called early.
 */
export const DeclareTemplateCategory =
  InterfaceFunction<
    (
      declaration: TemplateCategoryDeclaration,
    ) => Promise<DeclareTemplateCategoryResult>
  >();

/**
 * Writes past sends and their events into the send log with their own dates:
 * an import, not a send. Nothing is delivered, and no suppression,
 * automation or notification follows. Idempotent on each `importId`. Waits
 * for the module and its database when called early.
 */
export const ImportSends =
  InterfaceFunction<(params: SendImport) => Promise<ImportSendsResult>>();
