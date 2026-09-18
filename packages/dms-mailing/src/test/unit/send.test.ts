import type { EmailParams, EmailResponse } from "@antelopejs/interface-email";
import { expect } from "chai";
import type { SendTemplateParams } from "@antelopejs/interface-dms-mailing";
import {
  aggregateResults,
  deliverBatch,
  type DeliveredMessage,
  type DeliveryInput,
  deliverEach,
  type PreparedSend,
  recordAll,
  type SendRecordInput,
} from "../../services/send";
import { DEFAULT_CATEGORIES, type MailingSettingsValues } from "../../types";

const TRANSPORT_FAILURE = "socket hang up";
const INSERT_FAILURE = "insert rejected";
const RECIPIENTS = ["first@test.local", "second@test.local"];

const PREPARED: PreparedSend = {
  content: { locales: {} },
  locale: "en",
  templateId: "template-1",
  slug: "welcome",
  tenantId: "tenant-1",
};

const SETTINGS: MailingSettingsValues = {
  fallbackLocale: "en",
  logRetentionDays: 90,
  blockOnMissingVariables: false,
  senderName: "Sender",
  senderEmail: "sender@test.local",
  replyTo: "",
  webhookSecret: "secret",
  categories: DEFAULT_CATEGORIES,
};

const PARAMS: SendTemplateParams = {
  tenantId: PREPARED.tenantId,
  to: RECIPIENTS,
};

const input = (recipients: string[]): DeliveryInput => ({
  prepared: PREPARED,
  settings: SETTINGS,
  subject: "Hello",
  html: "<p>Hello</p>",
  recipients,
});

const accepted = (messageId: string): EmailResponse => ({
  success: true,
  status: "sent",
  messageId,
  provider: "test",
});

const delivered = (
  to: string,
  overrides: Partial<DeliveredMessage> = {},
): DeliveredMessage => ({
  to,
  status: "sent",
  outcome: { latencyMs: 1, providerMessageId: `m-${to}` },
  ...overrides,
});

describe("[unit] services/send delivery", () => {
  it("keeps the messages the provider accepted when a later send throws", async () => {
    const seen: string[] = [];
    const send = async (params: EmailParams): Promise<EmailResponse> => {
      const to = params.to as string;
      seen.push(to);
      if (to === RECIPIENTS[1]) throw new Error(TRANSPORT_FAILURE);
      return accepted("m-1");
    };

    const messages = await deliverEach(input(RECIPIENTS), send);

    expect(seen).to.deep.equal(RECIPIENTS);
    expect(messages.map((message) => message.status)).to.deep.equal([
      "sent",
      "failed",
    ]);
    expect(messages[0]?.outcome.providerMessageId).to.equal("m-1");
    expect(messages[1]?.outcome.error).to.contain(TRANSPORT_FAILURE);
  });

  it("keeps the sends it could record when a later insert throws", async () => {
    const save = async (
      _tenantId: string,
      record: SendRecordInput,
    ): Promise<string> => {
      if (record.to === RECIPIENTS[1]) throw new Error(INSERT_FAILURE);
      return "send-1";
    };

    const results = await recordAll(
      PREPARED,
      PARAMS,
      RECIPIENTS.map((to) => delivered(to)),
      save,
    );

    expect(results).to.have.length(2);
    expect(results[0]?.sendId).to.equal("send-1");
    expect(results[1]?.status).to.equal("failed");
    expect(results[1]?.error).to.contain(INSERT_FAILURE);
  });

  it("fails every recipient when the batch call itself throws", async () => {
    const messages = await deliverBatch(input(RECIPIENTS), () =>
      Promise.reject(new Error(TRANSPORT_FAILURE)),
    );

    expect(messages.map((message) => message.status)).to.deep.equal([
      "failed",
      "failed",
    ]);
    expect(messages[0]?.outcome.error).to.contain(TRANSPORT_FAILURE);
  });
});

describe("[unit] services/send result aggregation", () => {
  it("reports the whole call while keeping the single-recipient shape", () => {
    const single = aggregateResults([
      { sendId: "send-1", status: "sent", messageId: "m-1" },
    ]);

    expect(single.sendId).to.equal("send-1");
    expect(single.status).to.equal("sent");
    expect(single.messageId).to.equal("m-1");
    expect(single.error).to.equal(undefined);
    expect(single.results).to.have.length(1);
  });

  it("degrades to the worst recipient outcome and surfaces its error", () => {
    const results = [
      { sendId: "send-1", status: "sent" as const, messageId: "m-1" },
      { sendId: "send-2", status: "failed" as const, error: "Mailbox full" },
    ];

    const aggregated = aggregateResults(results);

    expect(aggregated.sendId).to.equal("send-1");
    expect(aggregated.messageId).to.equal("m-1");
    expect(aggregated.status).to.equal("failed");
    expect(aggregated.error).to.equal("Mailbox full");
    expect(aggregated.results).to.deep.equal(results);
  });

  it("prefers the least advanced status when nothing failed", () => {
    const aggregated = aggregateResults([
      { sendId: "send-1", status: "sent" },
      { sendId: "send-2", status: "queued" },
    ]);

    expect(aggregated.status).to.equal("queued");
  });
});
