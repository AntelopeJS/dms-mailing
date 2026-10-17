import type {
  DeclarationOutcome,
  DeclareSenderResult,
  SenderDeclaration,
} from "@antelopejs/interface-dms-mailing";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { SettingsModel } from "../db";
import type { MailingSettingsValues } from "../types";
import {
  type ParsedSenderDeclaration,
  senderDeclarationSchema,
} from "../validation/declarations.schema";
import { parseDeclared } from "./declaration-error";
import { fingerprintOf } from "./fingerprint";
import { inQueue } from "./serial-queue";
import { getSettings, settingsQueueKey } from "./settings";

/** The settings fields a sender declaration writes. */
type SenderFields = Pick<
  MailingSettingsValues,
  "senderName" | "senderEmail" | "replyTo"
>;

const senderFingerprint = (sender: SenderFields): string =>
  fingerprintOf({
    senderName: sender.senderName,
    senderEmail: sender.senderEmail,
    replyTo: sender.replyTo,
  });

const isUnset = (sender: SenderFields): boolean =>
  !sender.senderName && !sender.senderEmail && !sender.replyTo;

/** What a sender declaration does to the stored sender, by its state. */
function senderOutcome(
  current: SenderFields,
  previousHash: string | undefined,
  hash: string,
): DeclarationOutcome {
  if (previousHash === hash) return "unchanged";
  if (!previousHash) return isUnset(current) ? "created" : "kept";
  return senderFingerprint(current) === previousHash ? "updated" : "kept";
}

const WRITING_OUTCOMES = new Set<DeclarationOutcome>(["created", "updated"]);

async function applySender(
  declaration: ParsedSenderDeclaration,
): Promise<DeclareSenderResult> {
  const { tenantId } = declaration;
  const sender: SenderFields = {
    senderName: declaration.name,
    senderEmail: declaration.email,
    replyTo: declaration.replyTo,
  };
  const hash = senderFingerprint(sender);
  const settings = await getSettings(tenantId);
  const model = GetModel(SettingsModel, tenantId);
  const row = await model.get(tenantId);
  const outcome = senderOutcome(settings, row?.declaredSenderHash, hash);
  if (WRITING_OUTCOMES.has(outcome))
    await model.update(tenantId, { ...sender, declaredSenderHash: hash });
  return { outcome };
}

/**
 * Sets the workspace's sender (from name, address, reply-to) a project
 * declares from code: on a workspace with no sender yet it is written
 * (`created`); the declaration last applied is left alone (`unchanged`); a
 * changed declaration replaces a sender still as last declared (`updated`); a
 * sender a user entered before any declaration, or changed or cleared since,
 * is left as it is (`kept`).
 */
export function declareSender(
  input: SenderDeclaration,
): Promise<DeclareSenderResult> {
  const declaration = parseDeclared(
    senderDeclarationSchema,
    input,
    "invalid_sender",
    "sender declaration",
  );
  return inQueue(settingsQueueKey(declaration.tenantId), () =>
    applySender(declaration),
  );
}
