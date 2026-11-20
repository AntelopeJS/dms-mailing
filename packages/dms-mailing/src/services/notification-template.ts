import type { TemplateContent } from "../types";
import { declareTemplate } from "./declarations";
import { getSettings } from "./settings";

/** The template every DMS notification e-mail is sent with. */
export const NOTIFICATION_TEMPLATE_SLUG = "dms-notification";

const COPY = {
  en: {
    button: "Open",
    footer:
      "You receive this e-mail because e-mail is on for this kind of notification.",
    preferences: "Notification preferences",
  },
  fr: {
    button: "Ouvrir",
    footer:
      "Vous recevez cet e-mail parce que l'e-mail est activé pour ce type de notification.",
    preferences: "Préférences de notification",
  },
};

const shownIf = (path: string) => ({
  path,
  operator: "truthy" as const,
  value: "",
});

/** The template in `locale`, French copy for a French locale, else English. */
function notificationContent(locale: string): TemplateContent {
  const copy = locale.toLowerCase().startsWith("fr") ? COPY.fr : COPY.en;
  return {
    locales: {
      [locale]: {
        subject: "{{notification.title}}",
        preheader: "{{notification.description}}",
        blocks: [
          {
            id: "title",
            type: "heading",
            text: "{{notification.title}}",
            align: "left",
            size: 22,
            visibleIf: null,
          },
          {
            id: "description",
            type: "paragraph",
            text: "{{notification.description}}",
            align: "left",
            visibleIf: shownIf("notification.description"),
          },
          {
            id: "open",
            type: "button",
            text: copy.button,
            href: "{{notification.url}}",
            align: "left",
            visibleIf: shownIf("notification.url"),
          },
          {
            id: "footer",
            type: "footer",
            text: copy.footer,
            unsubscribeLabel: "",
            preferencesLabel: copy.preferences,
            visibleIf: null,
          },
        ],
      },
    },
  };
}

/**
 * Declares the notification template of `tenantId` in its fallback locale.
 * A template the workspace already has under the slug is kept as it is.
 */
export async function declareNotificationTemplate(
  tenantId: string,
): Promise<void> {
  const { fallbackLocale } = await getSettings(tenantId);
  await declareTemplate({
    tenantId,
    slug: NOTIFICATION_TEMPLATE_SLUG,
    name: { en: "Notification", fr: "Notification" },
    content: notificationContent(fallbackLocale),
    variables: [
      { path: "notification.title", type: "string", required: true },
      { path: "notification.description", type: "text", required: false },
      { path: "notification.url", type: "url", required: false },
    ],
    testData: {
      notification: {
        title: "Invoice INV-2041 is due tomorrow",
        description: "Open it to check the amount and the payment details.",
        url: "https://example.com/invoices/INV-2041",
      },
      preferencesUrl: "https://example.com/settings/user/notifications",
    },
  });
}
