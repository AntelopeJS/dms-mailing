declare global {
  /**
   * The raw messages the SMTP fixture received, oldest first: a global, since
   * the fixture's copy of this module is not the one the tests import.
   */
  var dmsMailingSmtpMessages: string[] | undefined;
}

export function recordSmtpMessage(message: string): void {
  globalThis.dmsMailingSmtpMessages ??= [];
  globalThis.dmsMailingSmtpMessages.push(message);
}

/** What nodemailer really wrote to the fixture, oldest first. */
export function smtpMessages(): string[] {
  return [...(globalThis.dmsMailingSmtpMessages ?? [])];
}
