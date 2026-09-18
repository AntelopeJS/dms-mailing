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

/** Delivery event reported by an e-mail provider webhook. */
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

export type SendStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "spam"
  | "failed"
  | "unsubscribed";

/** Renders a live template and sends it to the given recipients. */
export const SendTemplate =
  InterfaceFunction<
    (slug: string, params: SendTemplateParams) => Promise<SendTemplateResult>
  >();

/** Records a provider event against the send it belongs to. */
export const RecordEmailEvent =
  InterfaceFunction<
    (tenantId: string, event: EmailEvent) => Promise<boolean>
  >();
