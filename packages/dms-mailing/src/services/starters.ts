import type { MailingTemplate } from "../db";
import type {
  Block,
  LocaleContent,
  TemplateContent,
  VariableDefinition,
} from "../types";
import { footerForCategory } from "../engine";
import { blankFields, footerBlock } from "./templates";

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
  /** The test data as an English-speaking workspace gets it. */
  testData: Record<string, unknown>;
  /** The test data with its amounts written the way `locale` writes them. */
  testDataFor: (locale: string) => Record<string, unknown>;
}

type StarterSource = Omit<StarterTemplate, "testData">;

const DEFAULT_TEST_DATA_LOCALE = "en";
const STARTER_CURRENCY = "EUR";

/** `locale` when the runtime can format for it, English otherwise. */
function formattingLocale(locale: string): string {
  try {
    return (
      Intl.NumberFormat.supportedLocalesOf(locale)[0] ??
      DEFAULT_TEST_DATA_LOCALE
    );
  } catch {
    return DEFAULT_TEST_DATA_LOCALE;
  }
}

/** The ordered item of the order starter's test data, by language. */
const ORDER_LINE_NAMES: Record<string, string> = {
  en: "Ergo chair · Graphite × 4",
  fr: "Fauteuil ergonomique · Graphite × 4",
};
const LOCALE_PARTS = /[-_]/;

/** A test text in the language of `locale`, English when it has none. */
function inLanguageOf(texts: Record<string, string>, locale: string): string {
  const language = locale.toLowerCase().split(LOCALE_PARTS)[0] ?? "";
  return texts[language] ?? (texts[DEFAULT_TEST_DATA_LOCALE] as string);
}

/** An amount the way `locale` writes it: "€1,556.00", "1 556,00 €". */
function money(amount: number, locale: string): string {
  return new Intl.NumberFormat(formattingLocale(locale), {
    style: "currency",
    currency: STARTER_CURRENCY,
  }).format(amount);
}

interface StarterCopy {
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  button?: string;
  /** Why the recipient gets this e-mail: the footer's legal line. */
  footer: string;
}

const HEADING_SIZE = 26;

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
      footerBlock(locale, copy.footer),
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

const ORDER_TOTAL = 1556;
const INVOICE_AMOUNT = 318.9;

const STARTER_SOURCES: StarterSource[] = [
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
    testDataFor: (locale) => ({
      customer: { firstName: "Julie" },
      order: {
        number: "#10482",
        total: money(ORDER_TOTAL, locale),
        url: "https://example.com/orders/10482",
        lines: [
          {
            name: inLanguageOf(ORDER_LINE_NAMES, locale),
            total: money(ORDER_TOTAL, locale),
          },
        ],
      },
    }),
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
            footer:
              "You are receiving this e-mail because you placed an order with us.",
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
            footer: "Vous recevez cet e-mail suite à votre commande.",
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
    testDataFor: () => ({
      customer: { firstName: "Julie" },
      order: { number: "#10482" },
      shipment: { trackingUrl: "https://example.com/track/10482" },
    }),
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
            footer:
              "You are receiving this e-mail because you placed an order with us.",
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
            footer: "Vous recevez cet e-mail suite à votre commande.",
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
    testDataFor: () => ({
      user: { firstName: "Julie" },
      reset: { url: "https://example.com/reset/abc123" },
    }),
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
            footer:
              "You are receiving this e-mail because a password reset was requested for your account.",
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
            footer:
              "Vous recevez cet e-mail car une réinitialisation du mot de passe a été demandée pour votre compte.",
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
    testDataFor: (locale) => ({
      customer: { firstName: "Julie" },
      invoice: {
        number: "INV-2026-0918",
        amount: money(INVOICE_AMOUNT, locale),
        url: "https://example.com/invoices/0918",
      },
    }),
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
            footer:
              "You are receiving this e-mail because an invoice was issued for your account.",
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
            footer:
              "Vous recevez cet e-mail car une facture a été émise pour votre compte.",
          },
          [],
          "{{invoice.url}}",
        ),
      },
    },
  },
];

/**
 * The starters, each with the footer its category calls for: the shipped ones
 * are transactional, so their footer states why the e-mail was sent and
 * carries no unsubscribe link.
 */
export const STARTER_TEMPLATES: StarterTemplate[] = STARTER_SOURCES.map(
  (starter) => ({
    ...starter,
    testData: starter.testDataFor(DEFAULT_TEST_DATA_LOCALE),
    content: footerForCategory(starter.content, starter.category),
  }),
);

export function findStarter(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((starter) => starter.id === id);
}

/**
 * The content fields a template created from `starter` starts with, its test
 * data written in the workspace's `locale`: its amounts and its texts.
 */
export function starterFields(
  starter: StarterTemplate,
  locale: string = DEFAULT_TEST_DATA_LOCALE,
): Partial<MailingTemplate> {
  return {
    ...blankFields(starter.content),
    json_variables: JSON.stringify(starter.variables),
    json_test_data: JSON.stringify(starter.testDataFor(locale)),
  };
}
