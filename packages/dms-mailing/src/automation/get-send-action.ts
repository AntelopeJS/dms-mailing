import type {
  ActionType,
  JsonObject,
  JsonSchema,
} from "@antelopejs/interface-dms-automation";
import { z } from "zod";
import type { MailingSend, MailingSendEvent } from "../db";
import { sendDetail } from "../services/send-detail";
import {
  SEND_STAGES,
  SEND_STATUSES,
  SUPPRESSION_REASONS,
  type SuppressionSummary,
} from "../types";
import { parseJsonObject } from "../validation/json";
import { isoOrAbsent, parseInput, TENANT_INPUT } from "./action-input";
import { resolveTenant } from "./tenant";

export type GetSendInput = {
  tenantId?: string;
  sendId: string;
  includeEvents?: boolean;
};

type SendEventOutput = { type: string; at: string; details: JsonObject };

export type GetSendOutput = {
  found: boolean;
  sendId: string;
  templateSlug?: string;
  templateVersion?: number;
  locale?: string;
  recipientEmail?: string;
  recipientName?: string;
  status?: string;
  stage?: string;
  isTest?: boolean;
  source?: string;
  provider?: string;
  messageId?: string;
  error?: string;
  opens?: number;
  clicks?: number;
  isSoftBounce?: boolean;
  replayOf?: string;
  createdAt?: string;
  lastEventAt?: string;
  variables?: JsonObject;
  suppressed?: boolean;
  suppressionReason?: string;
  events?: SendEventOutput[];
  eventsTruncated?: boolean;
};

const GET_SEND_ACTION_ID = "mailing.get-send";

/** The most events the output carries: a busy send stores one per open and click. */
const MAX_SEND_EVENTS = 100;
const MAX_SEND_ID_LENGTH = 64;

const getSendInputSchema = z.object({
  sendId: z.string().trim().min(1).max(MAX_SEND_ID_LENGTH),
  includeEvents: z.boolean().default(true),
});

const STRING: JsonSchema = { type: "string" };
const NUMBER: JsonSchema = { type: "number" };
const BOOLEAN: JsonSchema = { type: "boolean" };

function jsonObjectOr(text: string | undefined): JsonObject {
  try {
    return parseJsonObject(text || "{}");
  } catch {
    return {};
  }
}

const eventOutput = (event: MailingSendEvent): SendEventOutput => ({
  type: event.type,
  at: new Date(event.at).toISOString(),
  details: jsonObjectOr(event.json_details),
});

function sendFields(send: MailingSend) {
  return {
    templateSlug: send.templateSlug,
    templateVersion: send.templateVersion,
    locale: send.locale,
    recipientEmail: send.recipientEmail,
    recipientName: send.recipientName || undefined,
    status: send.status,
    stage: send.stage,
    isTest: send.isTest,
    source: send.source || undefined,
    provider: send.provider || undefined,
    messageId: send.providerMessageId || undefined,
    error: send.error || undefined,
    opens: send.opens,
    clicks: send.clicks,
    isSoftBounce: send.isSoftBounce,
    replayOf: send.replayOf || undefined,
    createdAt: isoOrAbsent(send.createdAt),
    lastEventAt: isoOrAbsent(send.lastEventAt),
    variables: jsonObjectOr(send.json_variables),
  };
}

function eventsFields(events: MailingSendEvent[], isIncluded: boolean) {
  if (!isIncluded) return { events: [], eventsTruncated: false };
  return {
    events: events.slice(-MAX_SEND_EVENTS).map(eventOutput),
    eventsTruncated: events.length > MAX_SEND_EVENTS,
  };
}

const suppressionFields = (suppression: SuppressionSummary | null) => ({
  suppressed: suppression !== null,
  suppressionReason: suppression?.reason,
});

export const getSendAction: ActionType<GetSendInput, GetSendOutput> = {
  id: GET_SEND_ACTION_ID,
  name: "Get send",
  description:
    "Read one send of the mailing log: recipient, status, variables and provider events",
  icon: "i-ph-envelope-open",
  sideEffects: false,
  inputSchema: {
    type: "object",
    properties: {
      tenantId: TENANT_INPUT,
      sendId: {
        ...STRING,
        maxLength: MAX_SEND_ID_LENGTH,
        description: 'Send log id, e.g. from "E-mail event"',
      },
      includeEvents: {
        ...BOOLEAN,
        default: true,
        description: "Also return the send's provider events",
      },
    },
    required: ["sendId"],
  },
  outputSchema: {
    type: "object",
    properties: {
      found: {
        ...BOOLEAN,
        description: "The send exists and is not being purged",
      },
      sendId: { ...STRING, description: "Echo of the input" },
      templateSlug: STRING,
      templateVersion: { ...NUMBER, description: "0 for a draft test" },
      locale: { ...STRING, description: "Rendered locale" },
      recipientEmail: STRING,
      recipientName: STRING,
      status: { ...STRING, enum: SEND_STATUSES },
      stage: { ...STRING, enum: SEND_STAGES, description: "Send log tab" },
      isTest: BOOLEAN,
      source: { ...STRING, description: "What made the send" },
      provider: STRING,
      messageId: { ...STRING, description: "Provider message id" },
      error: STRING,
      opens: { ...NUMBER, minimum: 0 },
      clicks: { ...NUMBER, minimum: 0 },
      isSoftBounce: BOOLEAN,
      replayOf: { ...STRING, description: "Send this one sent again" },
      createdAt: STRING,
      lastEventAt: STRING,
      variables: {
        type: "object",
        description: "Values the send was rendered with",
      },
      suppressed: {
        ...BOOLEAN,
        description: "The recipient is on the suppression list today",
      },
      suppressionReason: { ...STRING, enum: SUPPRESSION_REASONS },
      events: {
        type: "array",
        description: `Provider timeline, oldest first; the newest ${MAX_SEND_EVENTS} when there are more`,
        items: {
          type: "object",
          properties: { type: STRING, at: STRING, details: { type: "object" } },
        },
      },
      eventsTruncated: {
        ...BOOLEAN,
        description: `More than ${MAX_SEND_EVENTS} events exist`,
      },
    },
  },
  async execute(input) {
    const { sendId, includeEvents } = parseInput(
      GET_SEND_ACTION_ID,
      getSendInputSchema,
      input,
    );
    const tenantId = await resolveTenant(GET_SEND_ACTION_ID, input.tenantId);
    const detail = await sendDetail(tenantId, sendId);
    if (!detail || detail.send.isRetiring) return { found: false, sendId };
    return {
      found: true,
      sendId,
      ...sendFields(detail.send),
      ...suppressionFields(detail.suppression),
      ...eventsFields(detail.events, includeEvents),
    };
  },
};
