import type { MailingTemplate } from "../db";
import type {
  Block,
  LocaleContent,
  TemplateContent,
  VariableDefinition,
} from "../types";
import { blankFields } from "./templates";

/**
 * A ready-made template a new workspace can start from instead of a blank
 * page. It arrives as a draft with its variables declared and test data
 * filled in, so it previews and test-sends right away.
 */
export interface StarterTemplate {
  id: string;
  name: string;
  slug: string;
  category: string;
  content: TemplateContent;
  variables: VariableDefinition[];
  testData: Record<string, unknown>;
}

interface StarterCopy {
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  button?: string;
}

const HEADING_SIZE = 26;

const FOOTER_LABELS: Record<string, [string, string]> = {
  en: ["Unsubscribe", "Preferences"],
  fr: ["Se désinscrire", "Préférences"],
};

const footer = (locale: string): Block => {
  const [unsubscribeLabel, preferencesLabel] = FOOTER_LABELS[locale] as [
    string,
    string,
  ];
  return {
    id: "footer",
    type: "footer",
    text: "",
    unsubscribeLabel,
    preferencesLabel,
    visibleIf: null,
  };
};

function localeContent(
  locale: string,
  copy: StarterCopy,
  extra: Block[],
  buttonHref: string,
): LocaleContent {
  const button: Block[] = copy.button
    ? [
        {
          id: "cta",
          type: "button",
          text: copy.button,
          href: buttonHref,
          align: "left",
          visibleIf: null,
        },
      ]
    : [];
  return {
    subject: copy.subject,
    preheader: copy.preheader,
    blocks: [
      {
        id: "heading",
        type: "heading",
        text: copy.heading,
        align: "left",
        size: HEADING_SIZE,
        visibleIf: null,
      },
      {
        id: "intro",
        type: "paragraph",
        text: copy.body,
        align: "left",
        visibleIf: null,
      },
      ...extra,
      ...button,
      footer(locale),
    ],
  };
}

const orderLines: Block[] = [
  {
    id: "lines",
    type: "list",
    source: "order.lines",
    labelPath: "name",
    valuePath: "total",
    visibleIf: null,
  },
  {
    id: "total",
    type: "total",
    label: "Total",
    value: "{{order.total}}",
    visibleIf: null,
  },
];

const v = (
  path: string,
  type: VariableDefinition["type"],
  required = true,
): VariableDefinition => ({ path, type, required });

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "order-confirmed",
    name: "Order confirmation",
    slug: "order-confirmed",
    category: "orders",
    variables: [
      v("customer.firstName", "string"),
      v("order.number", "string"),
      v("order.total", "money"),
      v("order.lines", "array"),
      v("order.url", "url"),
    ],
    testData: {
      customer: { firstName: "Julie" },
      order: {
        number: "#10482",
        total: "€1,556.00",
        url: "https://example.com/orders/10482",
        lines: [{ name: "Ergo chair · Graphite × 4", total: "€1,556.00" }],
      },
    },
    content: {
      locales: {
        en: localeContent(
          "en",
          {
            subject: "Thanks for your order {{order.number}}",
            preheader: "We're getting it ready. Here's your summary.",
            heading: "Thanks for your order, {{customer.firstName}}!",
            body: "We've received order {{order.number}} and we're getting it ready.",
            button: "Track your order",
          },
          orderLines,
          "{{order.url}}",
        ),
        fr: localeContent(
          "fr",
          {
            subject: "Merci pour votre commande {{order.number}}",
            preheader: "Nous la préparons. Voici votre récapitulatif.",
            heading: "Merci pour votre commande, {{customer.firstName}} !",
            body: "Nous avons bien reçu la commande {{order.number}} et nous la préparons.",
            button: "Suivre ma commande",
          },
          orderLines,
          "{{order.url}}",
        ),
      },
    },
  },
  {
    id: "order-shipped",
    name: "Shipping update",
    slug: "order-shipped",
    category: "orders",
    variables: [
      v("customer.firstName", "string"),
      v("order.number", "string"),
      v("shipment.trackingUrl", "url"),
    ],
    testData: {
      customer: { firstName: "Julie" },
      order: { number: "#10482" },
      shipment: { trackingUrl: "https://example.com/track/10482" },
    },
    content: {
      locales: {
        en: localeContent(
          "en",
          {
            subject: "Your order {{order.number}} has shipped",
            preheader: "It's on its way.",
            heading: "Your order {{order.number}} has shipped",
            body: "Good news {{customer.firstName}}, your parcel is on its way.",
            button: "Track the parcel",
          },
          [],
          "{{shipment.trackingUrl}}",
        ),
        fr: localeContent(
          "fr",
          {
            subject: "Votre commande {{order.number}} est expédiée",
            preheader: "Elle est en route.",
            heading: "Votre commande {{order.number}} est expédiée",
            body: "Bonne nouvelle {{customer.firstName}}, votre colis est en route.",
            button: "Suivre le colis",
          },
          [],
          "{{shipment.trackingUrl}}",
        ),
      },
    },
  },
  {
    id: "password-reset",
    name: "Password reset",
    slug: "password-reset",
    category: "account",
    variables: [v("user.firstName", "string"), v("reset.url", "url")],
    testData: {
      user: { firstName: "Julie" },
      reset: { url: "https://example.com/reset/abc123" },
    },
    content: {
      locales: {
        en: localeContent(
          "en",
          {
            subject: "Reset your password",
            preheader: "The link works for one hour.",
            heading: "Reset your password",
            body: "Hi {{user.firstName}}, click the button below to choose a new password. If you didn't ask for it, ignore this e-mail.",
            button: "Choose a new password",
          },
          [],
          "{{reset.url}}",
        ),
        fr: localeContent(
          "fr",
          {
            subject: "Réinitialisez votre mot de passe",
            preheader: "Le lien est valable une heure.",
            heading: "Réinitialisez votre mot de passe",
            body: "Bonjour {{user.firstName}}, cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Si vous ne l'avez pas demandé, ignorez cet e-mail.",
            button: "Choisir un nouveau mot de passe",
          },
          [],
          "{{reset.url}}",
        ),
      },
    },
  },
  {
    id: "invoice-ready",
    name: "Invoice available",
    slug: "invoice-ready",
    category: "billing",
    variables: [
      v("customer.firstName", "string"),
      v("invoice.number", "string"),
      v("invoice.amount", "money"),
      v("invoice.url", "url"),
    ],
    testData: {
      customer: { firstName: "Julie" },
      invoice: {
        number: "INV-2026-0918",
        amount: "€318.90",
        url: "https://example.com/invoices/0918",
      },
    },
    content: {
      locales: {
        en: localeContent(
          "en",
          {
            subject: "Invoice {{invoice.number}} is available",
            preheader: "Amount due: {{invoice.amount}}.",
            heading: "Invoice {{invoice.number}} is available",
            body: "Hi {{customer.firstName}}, your invoice of {{invoice.amount}} is ready.",
            button: "Download the invoice",
          },
          [],
          "{{invoice.url}}",
        ),
        fr: localeContent(
          "fr",
          {
            subject: "La facture {{invoice.number}} est disponible",
            preheader: "Montant dû : {{invoice.amount}}.",
            heading: "La facture {{invoice.number}} est disponible",
            body: "Bonjour {{customer.firstName}}, votre facture de {{invoice.amount}} est prête.",
            button: "Télécharger la facture",
          },
          [],
          "{{invoice.url}}",
        ),
      },
    },
  },
];

export function findStarter(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((starter) => starter.id === id);
}

/** The content fields a template created from `starter` starts with. */
export function starterFields(
  starter: StarterTemplate,
): Partial<MailingTemplate> {
  return {
    ...blankFields(starter.content),
    json_variables: JSON.stringify(starter.variables),
    json_test_data: JSON.stringify(starter.testData),
  };
}
