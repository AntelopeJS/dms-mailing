import {
  PREFERENCES_URL_PATH,
  SYSTEM_VARIABLE_PATHS,
  UNSUBSCRIBE_URL_PATH,
} from "../constants";
import type {
  Block,
  FooterBlock,
  LocaleContent,
  TemplateContent,
  VariableDefinition,
} from "../types";
import { collectReferencedPaths } from "./coverage";
import { getPath, isPresent } from "./paths";
import { walkBlocks } from "./walk";

/**
 * The category whose e-mails are campaigns; every other one is transactional.
 * The settings keep it: it can be renamed, never removed.
 */
export const MARKETING_CATEGORY = "marketing";

const SYSTEM_VARIABLE_TYPE = "url";

/** The footer fields that label a link, in the order the links show. */
const LABEL_KEYS = ["unsubscribeLabel", "preferencesLabel"] as const;

type FooterLabelKey = (typeof LABEL_KEYS)[number];

/** Each footer link: the label that shows it and the URL the caller passes. */
const FOOTER_LINKS: Record<FooterLabelKey, string> = {
  unsubscribeLabel: UNSUBSCRIBE_URL_PATH,
  preferencesLabel: PREFERENCES_URL_PATH,
};

export function isMarketingCategory(category?: string | null): boolean {
  return category === MARKETING_CATEGORY;
}

/**
 * Whether a new footer of this category carries the unsubscribe and
 * preferences links: a transactional e-mail (an order, a password reset…)
 * is not subscribed to, so only an uncategorised or marketing one does.
 */
export function hasFooterLinksByDefault(category?: string | null): boolean {
  return !category || isMarketingCategory(category);
}

const isFooter = (block: Block): block is FooterBlock =>
  block.type === "footer";

/** The URL paths a footer shows a link for: the ones with a label. */
export function footerLinkPaths(block: FooterBlock): string[] {
  return LABEL_KEYS.filter((key) => block[key].trim()).map(
    (key) => FOOTER_LINKS[key],
  );
}

/** The system paths a locale uses: footer links, then `{{…}}` references. */
export function localeSystemPaths(content: LocaleContent): string[] {
  const paths = new Set<string>();
  walkBlocks(content.blocks, (block) => {
    if (isFooter(block)) footerLinkPaths(block).forEach((p) => paths.add(p));
  });
  collectReferencedPaths(content)
    .filter((path) => SYSTEM_VARIABLE_PATHS.includes(path))
    .forEach((path) => paths.add(path));
  return SYSTEM_VARIABLE_PATHS.filter((path) => paths.has(path));
}

/** The system paths any locale of the content uses. */
export function contentSystemPaths(content: TemplateContent): string[] {
  const used = new Set(
    Object.values(content.locales).flatMap(localeSystemPaths),
  );
  return SYSTEM_VARIABLE_PATHS.filter((path) => used.has(path));
}

/**
 * The URLs a template's caller passes for the links its content shows,
 * declared like any variable of its contract: a marketing e-mail must carry a
 * working unsubscribe link, so they are required there.
 */
export function systemVariables(
  paths: string[],
  category?: string | null,
): VariableDefinition[] {
  const required = isMarketingCategory(category);
  return paths.map((path) => ({ path, type: SYSTEM_VARIABLE_TYPE, required }));
}

/** The required system URLs `data` does not provide. */
export function missingSystemVariables(
  content: LocaleContent,
  category: string | null | undefined,
  data: Record<string, unknown>,
): string[] {
  return systemVariables(localeSystemPaths(content), category)
    .filter((variable) => variable.required)
    .map((variable) => variable.path)
    .filter((path) => !isPresent(getPath(data, path)));
}

const withoutLinks = (block: Block): Block =>
  isFooter(block)
    ? { ...block, unsubscribeLabel: "", preferencesLabel: "" }
    : block;

/**
 * The content with the footers its category calls for: a transactional
 * template loses the unsubscribe and preferences links.
 */
export function footerForCategory(
  content: TemplateContent,
  category?: string | null,
): TemplateContent {
  if (hasFooterLinksByDefault(category)) return content;
  const locales = Object.fromEntries(
    Object.entries(content.locales).map(([code, locale]) => [
      code,
      { ...locale, blocks: locale.blocks.map(withoutLinks) },
    ]),
  );
  return { ...content, locales };
}
