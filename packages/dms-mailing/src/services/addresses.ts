import type { EmailAddress } from "@antelopejs/interface-email";
import { isText } from "../validation/guards";

export const addressOf = (to: EmailAddress): string =>
  isText(to) ? to : to.email;

export const nameOf = (to: EmailAddress): string | undefined =>
  isText(to) ? undefined : to.name;

export const toRecipients = (
  to: EmailAddress | EmailAddress[],
): EmailAddress[] => (Array.isArray(to) ? to : [to]);
