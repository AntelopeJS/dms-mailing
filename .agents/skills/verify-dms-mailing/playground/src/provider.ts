import { ImplementInterface } from "@antelopejs/interface-core";
import type {
  BatchEmailParams,
  BatchEmailResponse,
  EmailParams,
  EmailResponse,
  ProviderCapabilities,
} from "@antelopejs/interface-email";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const DELAY_IN_ADDRESS = /^delay-(\d+)(?:[+@]|$)/;

const recipientSchema = z.union([z.string(), z.object({ email: z.string() }).transform(({ email }) => email)]);

/** The address of a recipient, whether the module passed a string or an object. */
function addressOf(to: EmailParams["to"]): string {
  const [first] = [to].flat();
  return recipientSchema.parse(first ?? "");
}

/**
 * The delay a recipient asks for: `delay-<ms>@...` answers after that many
 * milliseconds, any other address at once. The delay lives in the address so a
 * journey controls the latency of each send by the recipient it picks.
 */
function delayOf(to: EmailParams["to"]): number {
  const found = DELAY_IN_ADDRESS.exec(addressOf(to));
  return found ? Number(found[1]) : 0;
}

/** The provider name `VERIFY_MAILING_PROVIDER_NAME` sets; `undefined` while it is unset. */
function configuredName(): string | undefined {
  return process.env.VERIFY_MAILING_PROVIDER_NAME;
}

function capabilities(): Promise<ProviderCapabilities> {
  const name = configuredName();
  if (name === undefined) return Promise.reject(new Error("the verification provider reports no capabilities"));
  return Promise.resolve({
    name,
    features: {
      batch: true,
      templates: false,
      scheduling: false,
      openTracking: true,
      clickTracking: true,
      inlineAttachments: false,
      tags: true,
      metadata: true,
      priority: false,
    },
  });
}

async function send(params: EmailParams): Promise<EmailResponse> {
  await new Promise((resolve) => setTimeout(resolve, delayOf(params.to)));
  return {
    success: true,
    status: "sent",
    messageId: `verify-${randomUUID()}`,
    timestamp: new Date(),
    provider: configuredName() ?? "verify",
  };
}

async function sendBatch(params: BatchEmailParams): Promise<BatchEmailResponse> {
  const responses = await Promise.all(
    params.messages.map(async (message, index) => ({
      ...(await send(message)),
      index,
      recipient: addressOf(message.to),
    })),
  );
  return { success: true, total: responses.length, successful: responses.length, failed: 0, responses };
}

/**
 * Replaces the e-mail provider with the verification provider when
 * `VERIFY_MAILING_PROVIDER` is `fake`: its capabilities carry the name
 * `VERIFY_MAILING_PROVIDER_NAME` sets (or fail while it is unset), and it
 * answers a send after the delay its recipient asks for (`delayOf`). Nothing
 * reaches the SMTP sink.
 */
export async function implementFakeProvider(): Promise<void> {
  if (process.env.VERIFY_MAILING_PROVIDER !== "fake") return;
  ImplementInterface(await import("@antelopejs/interface-email"), {
    Send: send,
    SendBatch: sendBatch,
    SendTemplate: () => Promise.reject(new Error("the verification provider has no templates")),
    GetCapabilities: capabilities,
  });
}
