import type {
  DeclareWebhookSecretResult,
  WebhookSecretDeclaration,
  WebhookSecretOutcome,
} from "@antelopejs/interface-dms-mailing";
import type { MailingSettingsValues } from "../types";
import { webhookSecretDeclarationSchema } from "../validation/declarations.schema";
import { parseDeclared } from "./declaration-error";
import { webhookSecretMatches } from "./events";
import { getSettings, saveWebhookSecret } from "./settings";

const SET: WebhookSecretOutcome = "set";

/**
 * What declaring `secret` does to the stored one: nothing when it is already
 * stored, nothing when the workspace owner set or rotated it and the caller
 * did not ask to replace it, else a write.
 */
export function webhookSecretOutcome(
  stored: Pick<MailingSettingsValues, "webhookSecret" | "webhookSecretSource">,
  secret: string,
  replaceRotated: boolean,
): WebhookSecretOutcome {
  if (webhookSecretMatches(secret, stored.webhookSecret)) return "unchanged";
  if (stored.webhookSecretSource === "operator" && !replaceRotated)
    return "kept";
  return SET;
}

/**
 * Sets the workspace's webhook secret a project ships as code. The secret is
 * never returned, and a refusal names the rule it broke, never the value.
 */
export async function declareWebhookSecret(
  input: WebhookSecretDeclaration,
): Promise<DeclareWebhookSecretResult> {
  const { tenantId, secret, replaceRotated } = parseDeclared(
    webhookSecretDeclarationSchema,
    input,
    "invalid_webhook_secret",
    "webhook secret declaration",
  );
  const stored = await getSettings(tenantId);
  const outcome = webhookSecretOutcome(stored, secret, replaceRotated);
  if (outcome === SET) await saveWebhookSecret(tenantId, secret, "declared");
  return { outcome };
}
