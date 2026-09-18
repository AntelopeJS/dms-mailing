export interface TemplateCategory {
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
  { id: "orders", label: "Orders", icon: "i-ph-package" },
  { id: "account", label: "Account & access", icon: "i-ph-lock" },
  { id: "billing", label: "Billing", icon: "i-ph-file-text" },
  { id: "marketing", label: "Marketing", icon: "i-ph-sparkle" },
  { id: "forms", label: "Forms", icon: "i-ph-textbox" },
];
