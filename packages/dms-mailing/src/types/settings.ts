import type { LocalizedText } from "@antelopejs/interface-dms-mailing";

/** A template category as stored: its label written once per language. */
export type TemplateCategory = {
  id: string;
  label: LocalizedText;
  icon: string;
};

/** A template category as one reader sees it: the label in their language. */
export interface CategoryInLocale {
  id: string;
  label: string;
  icon: string;
}

export interface MailingSettingsValues {
  fallbackLocale: string;
  logRetentionDays: number;
  blockOnMissingVariables: boolean;
  senderName: string;
  senderEmail: string;
  replyTo: string;
  webhookSecret: string;
  categories: TemplateCategory[];
}

export const DEFAULT_CATEGORIES: TemplateCategory[] = [
  {
    id: "orders",
    label: { en: "Orders", fr: "Commandes" },
    icon: "i-ph-package",
  },
  {
    id: "account",
    label: { en: "Account & access", fr: "Compte et accès" },
    icon: "i-ph-lock",
  },
  {
    id: "billing",
    label: { en: "Billing", fr: "Facturation" },
    icon: "i-ph-file-text",
  },
  {
    id: "marketing",
    label: { en: "Marketing", fr: "Marketing" },
    icon: "i-ph-sparkle",
  },
  {
    id: "forms",
    label: { en: "Forms", fr: "Formulaires" },
    icon: "i-ph-textbox",
  },
];

export const DEFAULT_FALLBACK_LOCALE = "en";

/**
 * The module defaults: what a tenant's settings start with, and what the
 * settings form offers to put back ("Use default"). The sender is empty and
 * the webhook secret is drawn per tenant, so neither has one.
 */
export const MODULE_DEFAULT_SETTINGS: Pick<
  MailingSettingsValues,
  | "fallbackLocale"
  | "logRetentionDays"
  | "blockOnMissingVariables"
  | "categories"
> = {
  fallbackLocale: DEFAULT_FALLBACK_LOCALE,
  logRetentionDays: 90,
  blockOnMissingVariables: false,
  categories: DEFAULT_CATEGORIES,
};
