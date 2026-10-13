/**
 * Why an address is on the suppression list: the receiving server said it
 * does not exist, the recipient reported spam or unsubscribed, or someone
 * added it by hand.
 */
export type SuppressionReason =
  | "hard_bounce"
  | "complaint"
  | "unsubscribe"
  | "manual";

export const SUPPRESSION_REASONS: SuppressionReason[] = [
  "hard_bounce",
  "complaint",
  "unsubscribe",
  "manual",
];

/** What the send log and its drawer say about a suppressed address. */
export interface SuppressionSummary {
  id: string;
  email: string;
  reason: SuppressionReason;
  createdAt: Date;
  /** The send whose event put the address on the list. */
  sendId?: string;
}
