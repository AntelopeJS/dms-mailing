import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import type {
  TemplateContent,
  TemplateDeclaration,
} from "@antelopejs/interface-dms-mailing";

export function contentWith(subject: string): TemplateContent {
  return {
    locales: {
      en: {
        subject,
        preheader: "",
        blocks: [
          {
            id: "intro",
            type: "paragraph",
            text: "Hello {{customer.firstName}}",
            align: "left",
            visibleIf: null,
          },
        ],
      },
    },
  };
}

export function declaration(
  slug: string,
  overrides: Partial<TemplateDeclaration> = {},
): TemplateDeclaration {
  return {
    tenantId: DEFAULT_TENANT_ID,
    slug,
    name: { en: `Declared ${slug}` },
    category: "orders",
    content: contentWith("Your order is ready"),
    variables: [{ path: "customer.firstName", type: "string", required: true }],
    testData: { customer: { firstName: "Sofie" } },
    author: "Release script",
    ...overrides,
  };
}

export async function mailing() {
  return import("@antelopejs/interface-dms-mailing");
}
