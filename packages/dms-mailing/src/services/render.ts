import { Logging } from "@antelopejs/interface-core/logging";
import {
  GenerateHtml,
  RegisterHtmlTemplate,
} from "@antelopejs/interface-dms/html-render";
import { getConfig } from "../config";
import { EMAIL_TEMPLATE_NAME } from "../constants";
import { renderFallbackHtml } from "../engine";
import type { ResolvedEmail } from "../types";

/** Props the `EmailMailingTemplate` Vue component receives from the DMS renderer. */
export interface MailingEmailProps {
  locale: string;
  email: ResolvedEmail;
}

const MailingEmailTemplate =
  RegisterHtmlTemplate<MailingEmailProps>(EMAIL_TEMPLATE_NAME);

/**
 * The markers Vue's server renderer leaves: fragments (`<!--[-->`, `<!--]-->`),
 * empty and `v-if` placeholders (`<!---->` in production, `<!--v-if-->` in
 * development) and teleport anchors. Noise in a sent message, and some filters
 * weigh it. Outlook's conditional comments (`<!--[if mso]>`) are not touched.
 */
const SSR_MARKERS =
  /<!--(?:\[|\]|v-if|teleport(?: start| end)?(?: anchor)?|)-->/g;

export const stripRenderMarkers = (html: string): string =>
  html.replace(SSR_MARKERS, "");

export async function renderEmailHtml(
  email: ResolvedEmail,
  locale: string,
): Promise<string> {
  if (!getConfig().useHtmlRender) return renderFallbackHtml(email, locale);
  try {
    return stripRenderMarkers(
      await GenerateHtml(MailingEmailTemplate, { locale, email }),
    );
  } catch (error) {
    Logging.Warn(
      `[dms-mailing] html-render unavailable, using fallback: ${String(error)}`,
    );
    return renderFallbackHtml(email, locale);
  }
}
