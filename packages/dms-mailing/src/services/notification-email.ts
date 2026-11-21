import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { GetClientBaseUrl } from "@antelopejs/interface-dms/client-base-url";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import {
  type NotificationData,
  NotificationEmailChannel,
} from "@antelopejs/interface-dms/notifications";
import type { SendStatus } from "@antelopejs/interface-dms-mailing";
import { sendUnlessSuppressed } from "./checked-send";
import {
  declareNotificationTemplate,
  NOTIFICATION_TEMPLATE_SLUG,
} from "./notification-template";

/** Labels a notification e-mail in the send log. */
const NOTIFICATION_SEND_SOURCE = "dms-mailing:notification";

const PREFERENCES_PATH = "/settings/user/notifications";

type NotificationEmailSkip =
  | "no_tenant"
  | "untranslated_text"
  | "unknown_user"
  | "unverified_address"
  | "not_a_member";

/** What one delivery did; `logged` carries the status of its send log row. */
export type NotificationEmailOutcome =
  | { outcome: "logged"; status: SendStatus }
  | { outcome: "skipped"; reason: NotificationEmailSkip };

/** `link` resolved against `base` when it is http(s); blank otherwise. */
function absoluteLink(
  link: string | undefined,
  base: string | undefined,
): string {
  if (!link) return "";
  const url = URL.parse(link, base);
  return url?.protocol === "http:" || url?.protocol === "https:"
    ? url.href
    : "";
}

/**
 * Mails one DMS notification to `userId` through the workspace's
 * `dms-notification` template. Skips a notification without a workspace or
 * with a `$` translation key (only the dashboard translates those), and a
 * user who is unknown, has no validated address or left the workspace.
 */
export async function deliverNotificationEmail(
  userId: string,
  data: NotificationData,
): Promise<NotificationEmailOutcome> {
  const { tenantId } = data;
  if (!tenantId) return { outcome: "skipped", reason: "no_tenant" };
  if (data.title.startsWith("$") || data.description.startsWith("$"))
    return { outcome: "skipped", reason: "untranslated_text" };
  const user = await GetModel(UserModel).get(userId);
  if (!user) return { outcome: "skipped", reason: "unknown_user" };
  if (!user.email || !user.isValidated)
    return { outcome: "skipped", reason: "unverified_address" };
  if (
    !user.owner &&
    !(await GetModel(TenantMemberModel, tenantId).existsByUser(user._id))
  )
    return { outcome: "skipped", reason: "not_a_member" };
  await declareNotificationTemplate(tenantId);
  const base = await GetClientBaseUrl();
  const { status } = await sendUnlessSuppressed(NOTIFICATION_TEMPLATE_SLUG, {
    tenantId,
    to: { email: user.email, name: user.name || undefined },
    locale: user.language || undefined,
    variables: {
      notification: {
        title: data.title,
        description: data.description,
        url: absoluteLink(data.linkTo, base),
      },
      preferencesUrl: absoluteLink(PREFERENCES_PATH, base),
    },
    source: NOTIFICATION_SEND_SOURCE,
  });
  return { outcome: "logged", status };
}

/**
 * Registers the DMS notifications' e-mail channel. `deliver` starts the
 * e-mail and returns, since the DMS send waits for it; a failure is logged.
 */
export function registerNotificationEmailChannel(): void {
  NotificationEmailChannel({
    deliver(userId, data, notificationId) {
      deliverNotificationEmail(userId, data).then(
        (result) => {
          if (result.outcome === "skipped")
            (result.reason === "untranslated_text"
              ? Logging.Warn
              : Logging.Debug)(
              `[dms-mailing] Notification ${notificationId} not mailed: ${result.reason}`,
            );
        },
        (error: unknown) =>
          Logging.Error(
            `[dms-mailing] Notification ${notificationId} e-mail failed: ${String(error)}`,
          ),
      );
    },
  });
}
