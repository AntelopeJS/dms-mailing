import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { type MailingWebhookStatus, WebhookStatusModel } from "../db";
import type {
  SendEventType,
  WebhookReceipt,
  WebhookRefusal,
  WebhookStatus,
} from "../types";
import { webhookSecretMatches } from "./events";
import { WEBHOOK_SECRET_HEADER } from "../constants";

export { WEBHOOK_SECRET_HEADER };

/** The message id of the event the settings' "Send a test event" posts. */
export const WEBHOOK_TEST_MESSAGE_ID = "dms-mailing-webhook-test";

const WEBHOOK_TEST_EVENT_TYPE: SendEventType = "delivered";
const WEBHOOK_TEST_TIMEOUT_MS = 10_000;
const JSON_CONTENT_TYPE = "application/json";

/** What the webhook answers a caller it refuses, in its own words. */
export const WEBHOOK_REFUSAL_MESSAGES: Record<WebhookRefusal, string> = {
  missing_secret: `The ${WEBHOOK_SECRET_HEADER} header is missing. Send the webhook secret shown in Mailing > Settings > Provider & webhook.`,
  bad_secret: `The ${WEBHOOK_SECRET_HEADER} header does not match the webhook secret of this workspace (Mailing > Settings > Provider & webhook). It changes when the secret is rotated.`,
  invalid_event:
    'The body is not a mailing event: send JSON with "messageId" and "type".',
};

/** The body of a refused webhook call. */
export interface WebhookRefusalBody {
  error: "webhook_refused";
  reason: WebhookRefusal;
  message: string;
}

/** What "Send a test event" found when it called the webhook URL. */
export interface WebhookTestOutcome {
  isReceived: boolean;
  url: string;
  durationMs: number;
  /** The HTTP status the URL answered; absent when it could not be reached. */
  httpStatus?: number;
  /** Why the webhook refused the test event. */
  refusal?: WebhookRefusal;
  /** Why the URL could not be reached (`ECONNREFUSED`, a timeout…). */
  networkError?: string;
}

export type WebhookFetch = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

export function refusalBody(reason: WebhookRefusal): WebhookRefusalBody {
  return {
    error: "webhook_refused",
    reason,
    message: WEBHOOK_REFUSAL_MESSAGES[reason],
  };
}

/** Why a request's secret is refused, `null` when it carries the tenant's. */
export function secretRefusal(
  provided: string | undefined,
  stored: string | undefined,
): WebhookRefusal | null {
  if (!provided) return "missing_secret";
  return webhookSecretMatches(provided, stored) ? null : "bad_secret";
}

export function isWebhookTestEvent(messageId: string): boolean {
  return messageId === WEBHOOK_TEST_MESSAGE_ID;
}

async function writeStatus(
  tenantId: string,
  patch: Partial<MailingWebhookStatus>,
): Promise<void> {
  try {
    await GetModel(WebhookStatusModel, tenantId).record(tenantId, patch);
  } catch (error) {
    Logging.Error("[dms-mailing] Could not record the webhook status:", error);
  }
}

/** Remembers the last request the webhook accepted; never throws. */
export function noteWebhookReceived(
  tenantId: string,
  receipt: Omit<WebhookReceipt, "at">,
): Promise<void> {
  return writeStatus(tenantId, {
    receivedAt: new Date(),
    receivedProvider: receipt.provider,
    receivedType: receipt.type,
    isReceivedMatched: receipt.isMatched,
    isReceivedTest: receipt.isTest,
  });
}

/** Remembers the last request the webhook refused; never throws. */
export function noteWebhookRefused(
  tenantId: string,
  provider: string,
  reason: WebhookRefusal,
): Promise<void> {
  return writeStatus(tenantId, {
    refusedAt: new Date(),
    refusedProvider: provider,
    refusedReason: reason,
  });
}

export function toWebhookStatus(
  row: MailingWebhookStatus | undefined,
): WebhookStatus {
  return {
    lastReceived: row?.receivedAt
      ? {
          at: row.receivedAt,
          provider: row.receivedProvider ?? "",
          type: row.receivedType ?? "",
          isMatched: !!row.isReceivedMatched,
          isTest: !!row.isReceivedTest,
        }
      : null,
    lastRefused:
      row?.refusedAt && row.refusedReason
        ? {
            at: row.refusedAt,
            provider: row.refusedProvider ?? "",
            reason: row.refusedReason,
          }
        : null,
  };
}

export async function readWebhookStatus(
  tenantId: string,
): Promise<WebhookStatus> {
  return toWebhookStatus(
    await GetModel(WebhookStatusModel, tenantId).get(tenantId),
  );
}

const describeError = (error: unknown): string =>
  error instanceof Error
    ? String((error.cause as Error | undefined)?.message ?? error.message)
    : String(error);

async function refusalOf(
  response: Response,
): Promise<WebhookRefusal | undefined> {
  try {
    const body = (await response.json()) as Partial<WebhookRefusalBody>;
    return body.reason;
  } catch {
    return undefined;
  }
}

/**
 * Posts a test event to the webhook URL the settings show, the way a
 * provider would: the URL, the secret and the event format are all tried.
 */
export async function sendWebhookTest(
  url: string,
  secret: string,
  fetcher: WebhookFetch = fetch,
): Promise<WebhookTestOutcome> {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: {
        "content-type": JSON_CONTENT_TYPE,
        [WEBHOOK_SECRET_HEADER]: secret,
      },
      body: JSON.stringify({
        messageId: WEBHOOK_TEST_MESSAGE_ID,
        type: WEBHOOK_TEST_EVENT_TYPE,
        details: { test: true },
      }),
      signal: AbortSignal.timeout(WEBHOOK_TEST_TIMEOUT_MS),
    });
    return {
      isReceived: response.ok,
      url,
      durationMs: elapsed(),
      httpStatus: response.status,
      refusal: response.ok ? undefined : await refusalOf(response),
    };
  } catch (error) {
    return {
      isReceived: false,
      url,
      durationMs: elapsed(),
      networkError: describeError(error),
    };
  }
}
