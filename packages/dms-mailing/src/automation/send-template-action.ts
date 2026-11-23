import type {
  ActionType,
  ExecutionCtx,
  JsonSchema,
} from "@antelopejs/interface-dms-automation";
import type { EmailAddress } from "@antelopejs/interface-email";
import type {
  SendTemplateResult,
  TemplateVariables,
} from "@antelopejs/interface-dms-mailing";
import {
  type CheckedSendParams,
  sendUnlessSuppressed,
  simulateUnlessSuppressed,
} from "../services/checked-send";
import { SEND_STATUSES } from "../types";
import { runAsAutomation } from "./origin";
import { automationActor, resolveTenant } from "./tenant";
import { TENANT_INPUT } from "./action-input";

export interface SendTemplateActionInput {
  tenantId?: string;
  slug: string;
  to: EmailAddress | EmailAddress[];
  locale?: string;
  variables?: TemplateVariables;
  source?: string;
}

export const SEND_TEMPLATE_ACTION_ID = "mailing.send-template";

const INPUT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    tenantId: {
      ...TENANT_INPUT,
      description: "Workspace id; empty sends from the default workspace",
    },
    slug: { type: "string", description: "Slug of the live mailing template" },
    to: {
      type: ["string", "array"],
      items: { type: "string" },
      description: "Recipient address, or the list of addresses to send to",
    },
    locale: {
      type: "string",
      description: "Locale to render; empty uses the workspace fallback locale",
    },
    variables: {
      type: "object",
      description: "Values of the template variables",
    },
    source: {
      type: "string",
      description:
        "Label in the send log; automation:<procedure id> by default",
    },
  },
  required: ["slug", "to"],
};

const RESULT_PROPERTIES = {
  sendId: { type: "string" },
  status: { type: "string", enum: SEND_STATUSES },
  messageId: { type: "string" },
  error: { type: "string" },
} satisfies { [name: string]: JsonSchema };

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

/** What the action hands the graph: the send's result, as JSON. */
type SendTemplateOutput = {
  sendId: string;
  status: SendTemplateResult["status"];
  messageId?: string;
  error?: string;
  results?: SendTemplateOutput[];
};

const failedRecipients = (result: SendTemplateOutput): SendTemplateOutput[] =>
  (result.results ?? [result]).filter((entry) => entry.status === "failed");

async function paramsOf(
  input: SendTemplateActionInput,
  ctx: ExecutionCtx,
): Promise<CheckedSendParams> {
  return {
    tenantId: await resolveTenant(SEND_TEMPLATE_ACTION_ID, input.tenantId),
    to: input.to,
    locale: input.locale,
    variables: input.variables ?? {},
    source: input.source?.trim() || automationActor(ctx.procedureId),
  };
}

async function send(
  input: SendTemplateActionInput,
  ctx: ExecutionCtx,
): Promise<SendTemplateOutput> {
  try {
    const params = await paramsOf(input, ctx);
    const result: SendTemplateOutput = await runAsAutomation(ctx, () =>
      sendUnlessSuppressed(input.slug, params),
    );
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
    ctx.log(
      "error",
      `Template "${input.slug}" could not be sent`,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

async function simulate(
  input: SendTemplateActionInput,
  ctx: ExecutionCtx,
): Promise<SendTemplateOutput> {
  const params = await paramsOf(input, ctx);
  const { result, preview, suppressed } = await simulateUnlessSuppressed(
    input.slug,
    params,
  );
  ctx.log("info", `test run: template "${input.slug}" not sent`, {
    subject: preview?.email.subject,
    locale: preview?.prepared.locale,
    version: preview?.prepared.version,
    missing: preview?.email.missing ?? [],
    suppressed,
  });
  return result;
}

export const sendTemplateAction: ActionType<
  SendTemplateActionInput,
  SendTemplateOutput
> = {
  id: SEND_TEMPLATE_ACTION_ID,
  name: "Send e-mail template",
  description: "Render a live mailing template and send it to a recipient",
  icon: "i-ph-envelope-simple",
  inputSchema: INPUT_SCHEMA,
  outputSchema: OUTPUT_SCHEMA,
  execute: send,
  dryRun: simulate,
};
