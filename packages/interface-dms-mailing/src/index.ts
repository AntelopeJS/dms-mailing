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

/** The locale a localized text is read in when the reader's has no text. */
export const LOCALIZED_TEXT_FALLBACK_LOCALE = "en";

/**
 * A text written once per language, keyed by language code:
 * `{ en: "Welcome", fr: "Bienvenue" }`. Each user reads the text of their
 * language, else the `en` one ({@link LOCALIZED_TEXT_FALLBACK_LOCALE}), which
 * a declaration must therefore hold.
 */
export type LocalizedText = Record<string, string>;

/**
 * A template a project ships as code. `slug` is the stable key the caller
 * chooses: declaring it again never creates a second template.
 */
export interface TemplateDeclaration {
  /** Explicit, non-blank workspace id. The caller authorizes and provisions it. */
  tenantId: string;
  slug: string;
  /** The name the dashboard shows, per language; an `en` text is required. */
  name: LocalizedText;
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
 * - `created`: initial publication completed (including a resumed seed), v1.
 * - `updated`: the declaration changed since the last call and the template
 *   was still exactly as last declared, so the new one was published.
 * - `unchanged`: the declaration is already applied; content is not changed.
 *   An interrupted history insert may be repaired. This does not imply live status.
 * - `kept`: the declaration changed but the template was edited, unpublished,
 *   archived or holds a draft since (or was made in the dashboard under that
 *   slug), so it was left as it is.
 */
export type DeclarationOutcome = "created" | "updated" | "unchanged" | "kept";

export interface DeclareTemplateResult {
  templateId: string;
  slug: string;
  outcome: DeclarationOutcome;
  /** Last published version, or 0; not a guarantee that the template is live. */
  version: number;
}

/** A template category a project ships as code, keyed by its `id`. */
export interface TemplateCategoryDeclaration {
  /** Explicit, non-blank workspace id. The caller authorizes and provisions it. */
  tenantId: string;
  id: string;
  /** The label the dashboard shows, per language; an `en` text is required. */
  label: LocalizedText;
  /** A Phosphor icon name, such as `i-ph-tag`. */
  icon: string;
}

export interface DeclareTemplateCategoryResult {
  id: string;
  outcome: DeclarationOutcome;
}

/**
 * The workspace's sender a project ships as code: what the settings'
 * Sender section holds.
 */
export interface SenderDeclaration {
  /** Explicit, non-blank workspace id. The caller authorizes and provisions it. */
  tenantId: string;
  /** The address e-mails are sent from. */
  email: string;
  /** The name shown next to it; none when absent. */
  name?: string;
  /** Where replies go; to the sender address when absent. */
  replyTo?: string;
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
 * chooses within a tenant: importing it again skips a retained send. Retention
 * also removes this deduplication record. Keep retry payloads immutable.
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
  /** Explicit, non-blank workspace id. The caller authorizes and provisions it. */
  tenantId: string;
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
 * Creates or refreshes a template from code. Newly created templates are
 * published; existing lifecycle choices are preserved. Idempotent on `slug`
 * within a tenant, and never overwrites what a user
 * changed since the last declaration: see {@link DeclarationOutcome}.
 * A storage error can reject after publication; retry the same declaration.
 */
export const DeclareTemplate =
  InterfaceFunction<
    (declaration: TemplateDeclaration) => Promise<DeclareTemplateResult>
  >();

/**
 * Adds a template category to the workspace settings from code. Idempotent
 * on `id`; a category a user relabelled or removed since is left as it is.
 * Serialization is process-local; coordinate concurrent settings writers.
 */
export const DeclareTemplateCategory =
  InterfaceFunction<
    (
      declaration: TemplateCategoryDeclaration,
    ) => Promise<DeclareTemplateCategoryResult>
  >();

/**
 * Writes the workspace's sender (from name, address, reply-to): call it once,
 * when the project provisions the workspace (`Hook.TENANT_BEING_PROVISIONED`).
 * The declared sender replaces the stored one; later edits in the settings
 * are the user's.
 * Do not run it concurrently with another settings writer of the same
 * workspace, such as `DeclareTemplateCategory`: each rewrites the whole
 * settings row.
 */
export const DeclareSender =
  InterfaceFunction<(declaration: SenderDeclaration) => Promise<void>>();

/**
 * Writes past sends and their events into the send log with their own dates:
 * an import, not a send. Nothing is delivered, and no suppression,
 * automation or notification follows. Idempotent on each `importId`.
 * Deduplicates events like the webhook. Batches are not transactional; retry
 * a partial failure with the same immutable payload and authorized tenantId.
 */
export const ImportSends =
  InterfaceFunction<(params: SendImport) => Promise<ImportSendsResult>>();
