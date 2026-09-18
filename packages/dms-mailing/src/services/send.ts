import {
  type BatchEmailMessageResponse,
  type BatchEmailParams,
  type BatchEmailResponse,
  type EmailAddress,
  type EmailParams,
  type EmailResponse,
  GetCapabilities,
  Send,
  SendBatch,
} from "@antelopejs/interface-email";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { MODULE_ID } from "../constants";
import { SendEventModel, SendModel, TemplateModel } from "../db";
import { resolveEmail } from "../engine";
import type {
  SendTemplateParams,
  SendTemplateResult,
} from "@antelopejs/interface-dms-mailing";
import type {
  MailingSettingsValues,
  SendStatus,
  TemplateContent,
} from "../types";
import { publishSendCreated } from "../realtime";
import { renderEmailHtml } from "./render";
import { getSettings } from "./settings";
import { toSendStatus } from "./status";
import { localeContentOf, parseContent, pickLocale } from "./templates";

export class SendError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface PreparedSend {
  content: TemplateContent;
  locale: string;
  templateId: string;
  slug: string;
  tenantId: string;
}

interface SendOutcome {
  latencyMs: number;
  provider?: string;
  providerMessageId?: string;
  error?: string;
}

export interface SendRecordInput {
  prepared: PreparedSend;
  to: EmailAddress;
  params: SendTemplateParams;
  status: SendStatus;
  outcome: SendOutcome;
}

export interface DeliveredMessage {
  to: EmailAddress;
  status: SendStatus;
  outcome: SendOutcome;
}

export interface DeliveryInput {
  prepared: PreparedSend;
  settings: MailingSettingsValues;
  subject: string;
  html: string;
  recipients: EmailAddress[];
}

export type EmailSender = (params: EmailParams) => Promise<EmailResponse>;

export type BatchEmailSender = (
  params: BatchEmailParams,
) => Promise<BatchEmailResponse>;

export type SendRecorder = (
  tenantId: string,
  input: SendRecordInput,
) => Promise<string>;

const MISSING_BATCH_RESPONSE =
  "The provider returned no result for this message";

const UNRECORDED_SEND_ID = "";

const SINGLE_MESSAGE = 1;

const OUTCOME_SEVERITY: Record<SendStatus, number> = {
  clicked: 0,
  opened: 1,
  delivered: 2,
  sent: 3,
  queued: 4,
  unsubscribed: 5,
  spam: 6,
  bounced: 7,
  failed: 8,
};

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const addressOf = (to: EmailAddress): string =>
  typeof to === "string" ? to : to.email;

const nameOf = (to: EmailAddress): string | undefined =>
  typeof to === "string" ? undefined : to.name;

const toRecipients = (to: EmailAddress | EmailAddress[]): EmailAddress[] =>
  Array.isArray(to) ? to : [to];

async function prepare(
  tenantId: string,
  slug: string,
  params: SendTemplateParams,
): Promise<PreparedSend> {
  const template = await GetModel(TemplateModel, tenantId).getBySlug(slug);
  if (!template) {
    throw new SendError("template_not_found", `Unknown template "${slug}"`);
  }
  if (template.status !== "live" && !params.isTest) {
    throw new SendError(
      "template_not_live",
      `Template "${slug}" is ${template.status}`,
    );
  }
  const content = params.content ?? parseContent(template);
  const settings = await getSettings(tenantId);
  return {
    content,
    locale: pickLocale(content, params.locale, settings.fallbackLocale),
    templateId: template._id,
    slug,
    tenantId,
  };
}

function messageFor(input: DeliveryInput, to: EmailAddress): EmailParams {
  const { prepared, settings, subject, html } = input;
  return {
    to,
    subject,
    html,
    from: settings.senderEmail
      ? { email: settings.senderEmail, name: settings.senderName || undefined }
      : undefined,
    replyTo: settings.replyTo || undefined,
    tags: [MODULE_ID, prepared.slug],
    metadata: {
      tenantId: prepared.tenantId,
      templateSlug: prepared.slug,
    },
    tracking: { opens: true, clicks: true },
  };
}

export function matchBatchResponses(
  recipients: EmailAddress[],
  responses: BatchEmailMessageResponse[],
  batchLatencyMs: number,
): DeliveredMessage[] {
  const byIndex = new Map(
    responses.map((response) => [response.index, response]),
  );
  const latencyMs = Math.round(
    batchLatencyMs / Math.max(recipients.length, SINGLE_MESSAGE),
  );
  return recipients.map((to, index) =>
    toDelivered(to, byIndex.get(index), latencyMs),
  );
}

function toDelivered(
  to: EmailAddress,
  response: EmailResponse | undefined,
  latencyMs: number,
): DeliveredMessage {
  if (!response) {
    return {
      to,
      status: "failed",
      outcome: { latencyMs, error: MISSING_BATCH_RESPONSE },
    };
  }
  return {
    to,
    status: response.success ? toSendStatus(response.status) : "failed",
    outcome: {
      latencyMs,
      provider: response.provider,
      providerMessageId: response.messageId,
      error: response.error?.message,
    },
  };
}

async function deliverOne(
  input: DeliveryInput,
  to: EmailAddress,
  send: EmailSender,
): Promise<DeliveredMessage> {
  const startedAt = Date.now();
  try {
    const response = await send(messageFor(input, to));
    return toDelivered(to, response, Date.now() - startedAt);
  } catch (error) {
    return {
      to,
      status: "failed",
      outcome: {
        latencyMs: Date.now() - startedAt,
        error: describeError(error),
      },
    };
  }
}

export async function deliverEach(
  input: DeliveryInput,
  send: EmailSender = Send,
): Promise<DeliveredMessage[]> {
  const delivered: DeliveredMessage[] = [];
  for (const to of input.recipients) {
    delivered.push(await deliverOne(input, to, send));
  }
  return delivered;
}

function failAll(
  recipients: EmailAddress[],
  latencyMs: number,
  error: string,
): DeliveredMessage[] {
  return recipients.map((to) => ({
    to,
    status: "failed",
    outcome: { latencyMs, error },
  }));
}

export async function deliverBatch(
  input: DeliveryInput,
  sendBatch: BatchEmailSender = SendBatch,
): Promise<DeliveredMessage[]> {
  const startedAt = Date.now();
  try {
    const batch = await sendBatch({
      messages: input.recipients.map((to) => messageFor(input, to)),
    });
    return matchBatchResponses(
      input.recipients,
      batch.responses,
      Date.now() - startedAt,
    );
  } catch (error) {
    return failAll(
      input.recipients,
      Date.now() - startedAt,
      describeError(error),
    );
  }
}

async function supportsBatch(): Promise<boolean> {
  try {
    const capabilities = await GetCapabilities();
    return capabilities.features.batch;
  } catch {
    return false;
  }
}

async function deliver(input: DeliveryInput): Promise<DeliveredMessage[]> {
  const canBatch = input.recipients.length > 1 && (await supportsBatch());
  return canBatch ? deliverBatch(input) : deliverEach(input);
}

async function record(
  tenantId: string,
  input: SendRecordInput,
): Promise<string> {
  const { prepared, to, params, status, outcome } = input;
  const [sendId] = await GetModel(SendModel, tenantId).insertSend({
    templateId: prepared.templateId,
    templateSlug: prepared.slug,
    locale: prepared.locale,
    recipientEmail: addressOf(to),
    recipientName: nameOf(to),
    status,
    provider: outcome.provider,
    providerMessageId: outcome.providerMessageId,
    latencyMs: outcome.latencyMs,
    error: outcome.error,
    source: params.source,
    json_variables: JSON.stringify(params.variables ?? {}),
    opens: 0,
    clicks: 0,
    isTest: Boolean(params.isTest),
  });
  await GetModel(SendEventModel, tenantId).insertForActiveSend({
    sendId: sendId as string,
    type: status,
    at: new Date(),
    json_details: JSON.stringify(
      outcome.error ? { reason: outcome.error } : {},
    ),
  });
  publishSendCreated(sendId as string);
  return sendId as string;
}

async function recordOne(
  prepared: PreparedSend,
  params: SendTemplateParams,
  message: DeliveredMessage,
  save: SendRecorder,
): Promise<SendTemplateResult> {
  try {
    const sendId = await save(prepared.tenantId, {
      prepared,
      to: message.to,
      params,
      status: message.status,
      outcome: message.outcome,
    });
    return {
      sendId,
      status: message.status,
      messageId: message.outcome.providerMessageId,
      error: message.outcome.error,
    };
  } catch (error) {
    return {
      sendId: UNRECORDED_SEND_ID,
      status: "failed",
      messageId: message.outcome.providerMessageId,
      error: describeError(error),
    };
  }
}

export async function recordAll(
  prepared: PreparedSend,
  params: SendTemplateParams,
  delivered: DeliveredMessage[],
  save: SendRecorder = record,
): Promise<SendTemplateResult[]> {
  const results: SendTemplateResult[] = [];
  for (const message of delivered) {
    results.push(await recordOne(prepared, params, message, save));
  }
  return results;
}

export function aggregateResults(
  results: SendTemplateResult[],
): SendTemplateResult {
  const first = results[0] as SendTemplateResult;
  const worst = results.reduce((left, right) =>
    OUTCOME_SEVERITY[right.status] > OUTCOME_SEVERITY[left.status]
      ? right
      : left,
  );
  return {
    sendId: first.sendId,
    status: worst.status,
    messageId: first.messageId,
    error: results.find((result) => result.error)?.error,
    results,
  };
}

export async function sendTemplate(
  slug: string,
  params: SendTemplateParams,
): Promise<SendTemplateResult> {
  const recipients = toRecipients(params.to);
  if (recipients.length === 0) {
    throw new SendError("no_recipient", `Template "${slug}" has no recipient`);
  }
  const prepared = await prepare(params.tenantId, slug, params);
  const settings = await getSettings(params.tenantId);
  const localeContent = localeContentOf(prepared.content, prepared.locale);
  if (!localeContent) {
    throw new SendError(
      "invalid_content",
      `Template "${slug}" has no content for "${prepared.locale}"`,
    );
  }
  const email = resolveEmail(localeContent, params.variables ?? {});
  if (settings.blockOnMissingVariables && email.missing.length) {
    throw new SendError("missing_variables", email.missing.join(", "));
  }
  const delivered = await deliver({
    prepared,
    settings,
    subject: email.subject,
    html: await renderEmailHtml(email, prepared.locale),
    recipients,
  });
  return aggregateResults(await recordAll(prepared, params, delivered));
}
