import type { SendErrorCode } from "@antelopejs/interface-dms-mailing";

/** Why a send was refused before anything left: `code` names the rule. */
export class SendError extends Error {
  constructor(
    public readonly code: SendErrorCode,
    message: string,
  ) {
    super(message);
  }
}
