import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import {
  GeneralSubject,
  Notification,
} from "@antelopejs/interface-dms/notifications";
import type { NotificationData } from "@antelopejs/interface-dms/notifications/types";
import { PROBLEM_STATUSES, type SendEventType } from "../types";

export interface BounceNotificationInput {
  sendId: string;
  templateSlug: string;
  recipientEmail: string;
  type: SendEventType;
}

export interface IdempotentNotificationTarget {
  toUsersIdempotently(userIds: string[], idempotencyKey: string): Promise<void>;
}

export interface BounceNotificationData extends NotificationData {
  linkTo: string;
  params: Record<string, string | number>;
}

const SENDS_PROBLEMS_LINK = "/modules/mailing/sends?tab=problems";
const IDEMPOTENCY_KEY_SEPARATOR = ":";
const BOUNCE_ICON = "i-ph-warning";
const BOUNCE_TITLE = "$dms_mailing.notifications.bounce_title";
const BOUNCE_DESCRIPTION = "$dms_mailing.notifications.bounce_description";

export function shouldNotify(type: SendEventType): boolean {
  return PROBLEM_STATUSES.includes(type);
}

export function bounceNotification(
  input: BounceNotificationInput,
): BounceNotificationData {
  return {
    icon: BOUNCE_ICON,
    title: BOUNCE_TITLE,
    description: BOUNCE_DESCRIPTION,
    subject: GeneralSubject,
    linkTo: SENDS_PROBLEMS_LINK,
    params: { slug: input.templateSlug, email: input.recipientEmail },
  };
}

export function bounceIdempotencyKey(input: BounceNotificationInput): string {
  return `${input.sendId}${IDEMPOTENCY_KEY_SEPARATOR}${input.type}`;
}

export function deliverBounceNotification(
  target: IdempotentNotificationTarget,
  userIds: string[],
  input: BounceNotificationInput,
): Promise<void> {
  return target.toUsersIdempotently(userIds, bounceIdempotencyKey(input));
}

async function tenantOwnerIds(tenantId: string): Promise<string[]> {
  const owners = await GetModel(TenantMemberModel, tenantId).listOwners();
  return owners.map((owner) => owner.userId);
}

export async function notifyBounce(
  tenantId: string,
  input: BounceNotificationInput,
): Promise<void> {
  if (!shouldNotify(input.type)) return;
  try {
    const userIds = await tenantOwnerIds(tenantId);
    if (userIds.length === 0) return;
    const data = bounceNotification(input);
    const notification = Notification()
      .icon(data.icon)
      .title(data.title)
      .description(data.description)
      .subject(data.subject)
      .linkTo(data.linkTo)
      .params(data.params)
      .build();
    await deliverBounceNotification(notification, userIds, input);
  } catch (error) {
    Logging.Error(
      `[dms-mailing] Failed to notify the bounce of "${input.recipientEmail}": ${String(error)}`,
    );
  }
}
