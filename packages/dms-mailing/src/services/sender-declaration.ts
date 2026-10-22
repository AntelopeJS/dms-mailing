import type { SenderDeclaration } from "@antelopejs/interface-dms-mailing";
import { senderDeclarationSchema } from "../validation/declarations.schema";
import { parseDeclared } from "./declaration-error";
import { getSettings, saveSettings } from "./settings";

/**
 * Writes the workspace's sender (from name, address, reply-to) a project
 * sets up when it provisions the workspace. A plain write: the declared
 * sender replaces the stored one, and later edits in the settings are the
 * user's.
 */
export async function declareSender(input: SenderDeclaration): Promise<void> {
  const declaration = parseDeclared(
    senderDeclarationSchema,
    input,
    "invalid_sender",
    "sender declaration",
  );
  const { tenantId } = declaration;
  const settings = await getSettings(tenantId);
  await saveSettings(tenantId, {
    ...settings,
    senderName: declaration.name,
    senderEmail: declaration.email,
    replyTo: declaration.replyTo,
  });
}
