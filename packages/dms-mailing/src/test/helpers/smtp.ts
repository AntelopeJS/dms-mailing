/**
 * The raw messages the SMTP fixture received, oldest first. The fixture runs
 * in the test process, so a test reads what nodemailer really wrote.
 */
const received: string[] = [];

export function recordSmtpMessage(message: string): void {
  received.push(message);
}

export function smtpMessages(): string[] {
  return [...received];
}
