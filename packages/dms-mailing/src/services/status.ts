import type { EmailStatus } from "@antelopejs/interface-email";
import type { SendStatus } from "../types";

const STATUS_MAP: Record<EmailStatus, SendStatus> = {
  queued: "queued",
  sent: "sent",
  delivered: "delivered",
  failed: "failed",
  rejected: "bounced",
  scheduled: "queued",
  unknown: "sent",
};

export function toSendStatus(status: EmailStatus): SendStatus {
  return STATUS_MAP[status];
}
