/** Why a send was refused before anything left: `code` names the rule. */
export class SendError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
