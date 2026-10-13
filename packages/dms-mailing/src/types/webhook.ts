/** Why the webhook refused a request, as the settings tell it. */
export type WebhookRefusal = "missing_secret" | "bad_secret" | "invalid_event";

/** The last request the webhook accepted. */
export interface WebhookReceipt {
  at: Date;
  provider: string;
  type: string;
  /**
   * Whether the event was recorded against a send: not when no send carries
   * its message id, nor when the provider delivered it twice.
   */
  isMatched: boolean;
  /** Sent by the settings' "Send a test event" button. */
  isTest: boolean;
}

/** The last request the webhook refused. */
export interface WebhookRejection {
  at: Date;
  provider: string;
  reason: WebhookRefusal;
}

/** What the settings show about the webhook. */
export interface WebhookStatus {
  lastReceived: WebhookReceipt | null;
  lastRefused: WebhookRejection | null;
}
