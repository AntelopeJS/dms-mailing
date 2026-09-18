import type {
  ActionType,
  JsonSchema,
} from "@antelopejs/interface-dms-automation";
import type { EmailAddress } from "@antelopejs/interface-email";
import type { SendTemplateResult } from "@antelopejs/interface-dms-mailing";
import { sendTemplate } from "../services/send";
import { SEND_STATUSES } from "../types";

export interface SendTemplateActionInput {
  tenantId: string;
  slug: string;
  to: EmailAddress | EmailAddress[];
  locale?: string;
  variables?: Record<string, unknown>;
  source?: string;
}

export const SEND_TEMPLATE_ACTION_ID = "mailing.send-template";

const AUTOMATION_SOURCE_PREFIX = "automation:";

const INPUT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    tenantId: { type: "string" },
    slug: { type: "string", description: "Slug of the live mailing template" },
    // A list, not just one address: the automation module has no loop node, so
    // a procedure cannot call this action once per contact — the fan-out has to
    // happen here. `sendTemplate` already accepts both shapes.
    to: {
      type: ["string", "array"],
      items: { type: "string" },
      description: "Recipient address, or the list of addresses to send to",
    },
    locale: { type: "string" },
    variables: { type: "object" },
    source: { type: "string" },
  },
  required: ["tenantId", "slug", "to"],
};

const RESULT_PROPERTIES: JsonSchema = {
  sendId: { type: "string" },
  status: { type: "string", enum: SEND_STATUSES },
  messageId: { type: "string" },
  error: { type: "string" },
};

const OUTPUT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    ...RESULT_PROPERTIES,
    results: {
      type: "array",
      description: "One entry per recipient",
      items: { type: "object", properties: RESULT_PROPERTIES },
    },
  },
};

const failedRecipients = (result: SendTemplateResult): SendTemplateResult[] =>
  (result.results ?? [result]).filter((entry) => entry.status === "failed");

export const sendTemplateAction: ActionType<
  SendTemplateActionInput,
  SendTemplateResult
> = {
  id: SEND_TEMPLATE_ACTION_ID,
  name: "Send e-mail template",
  description: "Render a live mailing template and send it to a recipient",
  icon: "i-ph-envelope-simple",
  inputSchema: INPUT_SCHEMA,
  outputSchema: OUTPUT_SCHEMA,
  async execute(input, ctx) {
    const source =
      input.source ?? `${AUTOMATION_SOURCE_PREFIX}${ctx.procedureId}`;
    try {
      const result = await sendTemplate(input.slug, {
        tenantId: input.tenantId,
        to: input.to,
        locale: input.locale,
        variables: input.variables,
        source,
      });
      const failures = failedRecipients(result);
      if (failures.length > 0) {
        ctx.log(
          "error",
          `Template "${input.slug}" was rejected for ${failures.length} recipient(s)`,
          failures,
        );
      }
      return result;
    } catch (error) {
      ctx.log("error", `Template "${input.slug}" could not be sent`, error);
      throw error;
    }
  },
};
