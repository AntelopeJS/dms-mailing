import { type MailingSend, MailingTemplate, type SendSummary } from "../../db";

const EPOCH = new Date(0);

/** A complete send row; `fields` set what a test is about. */
export function sendRow(fields: Partial<MailingSend> = {}): MailingSend {
  return {
    _id: "send",
    createdAt: EPOCH,
    templateId: "template",
    templateSlug: "welcome",
    locale: "en",
    requestedLocale: "en",
    templateVersion: 1,
    recipientEmail: "to@example.test",
    status: "sent",
    stage: "in_progress",
    latencyMs: null,
    json_variables: "{}",
    opens: 0,
    clicks: 0,
    revision: "revision",
    isTest: false,
    ...fields,
  };
}

/** A complete send summary: the send row without its rendered variables. */
export function summaryRow(fields: Partial<SendSummary> = {}): SendSummary {
  const { json_variables: _variables, ...summary } = sendRow();
  return { ...summary, ...fields };
}

/** A complete template row; `fields` set what a test is about. */
export function templateRow(
  fields: Partial<MailingTemplate> = {},
): MailingTemplate {
  return Object.assign(new MailingTemplate(), {
    _id: "template",
    createdAt: EPOCH,
    updatedAt: EPOCH,
    slug: "template",
    name: "Template",
    category: "",
    status: "draft",
    json_content: '{"locales":{}}',
    draftRevision: 0,
    publishedVersion: 0,
    json_variables: "[]",
    json_test_data: "{}",
    locales: "",
    updatedBy: "",
    attention: "",
    needsAttention: false,
    ...fields,
  });
}
