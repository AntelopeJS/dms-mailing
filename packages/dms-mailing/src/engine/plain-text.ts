import type { ResolvedBlock, ResolvedEmail } from "../types";

type BlockText = (block: ResolvedBlock, separator: string) => string;

const PARAGRAPH_BREAK = "\n\n";
const LINE_BREAK = "\n";
const DEFAULT_LABEL_SEPARATOR = ": ";
const LOCALE_PARTS = /[-_]/;
const DIVIDER = "----------";
const FOOTER_TYPE = "footer";

/**
 * Languages whose typography spaces a colon off its label, with a no-break
 * space so the colon never starts a line ("Total : 64,00 €").
 */
const LABEL_SEPARATORS: Record<string, string> = {
  fr: " : ",
};

/** What goes between a label and its value in the e-mail's language. */
export function labelSeparatorOf(locale = ""): string {
  const language = locale.toLowerCase().split(LOCALE_PARTS)[0] ?? "";
  return LABEL_SEPARATORS[language] ?? DEFAULT_LABEL_SEPARATOR;
}

const linked = (label: string, href: string, separator: string): string =>
  href ? `${label}${separator}${href}` : "";

const rowsText = (rows: string[][], separator: string): string =>
  rows
    .map((cells) => cells.filter(Boolean).join(separator))
    .filter(Boolean)
    .join(LINE_BREAK);

const footerText = (block: ResolvedBlock, separator: string): string => {
  if (block.type !== FOOTER_TYPE) return "";
  const lines = [
    block.text,
    linked(block.unsubscribeLabel, block.unsubscribeUrl, separator),
    linked(block.preferencesLabel, block.preferencesUrl, separator),
  ].filter((line) => line.trim());
  return lines.length ? [DIVIDER, ...lines].join(LINE_BREAK) : "";
};

const BLOCK_TEXT: Record<ResolvedBlock["type"], BlockText> = {
  hero: (block) => (block.type === "hero" && block.imageUrl ? block.alt : ""),
  heading: (block) => (block.type === "heading" ? block.text : ""),
  paragraph: (block) => (block.type === "paragraph" ? block.text : ""),
  code: (block) => (block.type === "code" ? block.text : ""),
  list: (block, separator) =>
    block.type === "list"
      ? rowsText(
          block.rows.map((row) => [row.label, row.value]),
          separator,
        )
      : "",
  total: (block, separator) =>
    block.type === "total"
      ? rowsText([[block.label, block.value]], separator)
      : "",
  button: (block, separator) =>
    block.type === "button" ? linked(block.text, block.href, separator) : "",
  divider: () => DIVIDER,
  footer: footerText,
};

const blocksText = (blocks: ResolvedBlock[], separator: string): string[] =>
  blocks
    .map((block) => BLOCK_TEXT[block.type](block, separator).trim())
    .filter(Boolean);

/**
 * The plain-text part of the e-mail: the same blocks as the HTML, in the same
 * order, footer last, punctuated the way the e-mail's language writes it.
 * Mail clients that show no HTML, and spam filters that weigh a missing text
 * part, read this one.
 */
export function renderPlainText(email: ResolvedEmail, locale = ""): string {
  const separator = labelSeparatorOf(locale);
  const body = email.blocks.filter((block) => block.type !== FOOTER_TYPE);
  const footer = email.blocks.filter((block) => block.type === FOOTER_TYPE);
  return [
    ...blocksText(body, separator),
    ...blocksText(footer, separator),
  ].join(PARAGRAPH_BREAK);
}
