import { createHash } from "node:crypto";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { MAILING_SUPPRESSIONS_TABLE_NAME, MailingSuppression } from "../tables";

type NewSuppression = Omit<MailingSuppression, "_id" | "createdAt">;

const ID_LENGTH = 32;

/** The address as the list keeps it: trimmed and lower-cased. */
export function normalizeAddress(email: string): string {
  return email.trim().toLowerCase();
}

/** The id of an address's entry: the same whoever adds it. */
export function suppressionIdOf(email: string): string {
  return createHash("sha256")
    .update(normalizeAddress(email))
    .digest("hex")
    .slice(0, ID_LENGTH);
}

export class SuppressionModel extends BasicDataModel(
  MailingSuppression,
  MAILING_SUPPRESSIONS_TABLE_NAME,
) {
  async findByEmail(email: string): Promise<MailingSuppression | undefined> {
    return this.get(suppressionIdOf(email));
  }

  /** The entries of the addresses given, whatever their case. */
  async listByEmails(emails: string[]): Promise<MailingSuppression[]> {
    const unique = [...new Set(emails.map(normalizeAddress))];
    if (!unique.length) return [];
    return this.getBy("email", ...unique);
  }

  /**
   * Puts an address on the list unless it already is.
   * @returns Whether this call added it
   */
  async add(entry: NewSuppression): Promise<boolean> {
    const email = normalizeAddress(entry.email);
    const id = suppressionIdOf(email);
    if (await this.get(id)) return false;
    try {
      await this.insert({ ...entry, email, _id: id });
      return true;
    } catch (error) {
      if (await this.get(id)) return false;
      throw error;
    }
  }
}
