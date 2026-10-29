import type { ResolvedBlock, ResolvedEmail } from "../types";

const ESCAPES = new Map([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ['"', "&quot;"],
  ["'", "&#39;"],
]);

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ESCAPES.get(char) ?? char);

const LINE_BREAK = /\r?\n/g;

/** Escaped text whose line breaks survive as `<br>`, as typed in the editor. */
const escapeLines = (value: string): string =>
  escapeHtml(value).replace(LINE_BREAK, "<br>");

const SAFE_SCHEMES = ["http:", "https:", "mailto:"];
const BLOCKED_HREF = "#";
const SCHEME_PATTERN = /^\s*([a-z][a-z0-9+.-]*):/i;

/**
 * A link target can be an interpolated variable, so it is data the sender does
 * not control. Escaping the entities keeps it inside the attribute; this keeps
 * the scheme to one a mail client may follow. A target with no scheme is
 * relative (or still an unresolved token) and passes through; a blocked one
 * becomes `blocked`.
 */
export const safeUrl = (
  value: string,
  blocked: string = BLOCKED_HREF,
): string => {
  const scheme = SCHEME_PATTERN.exec(value);
  if (!scheme) return value;
  return SAFE_SCHEMES.includes(scheme[1]!.toLowerCase() + ":")
    ? value
    : blocked;
};

/**
 * The font, palette and spacing below are those of the DMS e-mail layout
 * (`emailStyles` of the dms-layout), so an e-mail looks the same whichever
 * renderer drew it.
 */
const FONT =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const WRAP = "overflow-wrap:anywhere;word-break:break-word";
const TEXT_COLOR = "#525252";
const HEADING_COLOR = "#1a1a1a";
const BORDER_COLOR = "#e4e4e7";
const MUTED_COLOR = "#71717a";
const PAGE_COLOR = "#f6f9fc";
const CODE_SURFACE = "#f4f4f5";
const CODE_COLOR = "#18181b";
const CODE_FONT = "font-family:'SF Mono',Monaco,'Courier New',monospace";
const TEXT_STYLE = `${FONT};font-size:15px;line-height:1.6;color:${TEXT_COLOR};${WRAP}`;
const BLOCK_SPACING = "margin:0 0 16px";
const BUTTON_STYLE = `display:inline-block;padding:12px 24px;border-radius:6px;background:${CODE_COLOR};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600`;
const DIVIDER = `<hr style="border:0;border-top:1px solid ${BORDER_COLOR};margin:32px 0">`;
const FOOTER_STYLE = `${FONT};font-size:12px;line-height:1.5;color:${MUTED_COLOR};text-align:center;margin:0;${WRAP}`;
const FOOTER_LINK_SEPARATOR = " · ";
const CONTENT_WIDTH = 600;
const VIEWPORT = "width=device-width, initial-scale=1";

type BlockHtml = (block: ResolvedBlock) => string;

const link = (label: string, href: string): string =>
  href
    ? `<a href="${escapeHtml(safeUrl(href))}" style="color:${MUTED_COLOR};text-decoration:underline">${escapeHtml(label)}</a>`
    : "";

const row = (label: string, value: string, weight: string): string =>
  `<tr><td style="${TEXT_STYLE};font-weight:${weight}">${escapeHtml(label)}</td><td align="right" style="${TEXT_STYLE};font-weight:${weight};text-align:right">${escapeHtml(value)}</td></tr>`;

const table = (rows: string): string =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${BLOCK_SPACING}">${rows}</table>`;

const TEXT_RENDERERS = {
  heading: (block) =>
    block.type === "heading"
      ? `<h1 style="${FONT};font-size:${block.size}px;font-weight:600;color:${HEADING_COLOR};text-align:${block.align};margin:0 0 24px;${WRAP}">${escapeLines(block.text)}</h1>`
      : "",
  paragraph: (block) =>
    block.type === "paragraph"
      ? `<p style="${TEXT_STYLE};text-align:${block.align};${BLOCK_SPACING}">${escapeLines(block.text)}</p>`
      : "",
  code: (block) =>
    block.type === "code"
      ? `<div style="background:${CODE_SURFACE};border-radius:6px;margin:24px 0;padding:20px;text-align:center"><p style="${CODE_FONT};font-size:32px;font-weight:700;letter-spacing:6px;color:${CODE_COLOR};margin:0;${WRAP}">${escapeHtml(block.text)}</p></div>`
      : "",
  button: (block) =>
    block.type === "button"
      ? `<div style="text-align:${block.align};margin:24px 0"><a href="${escapeHtml(safeUrl(block.href))}" style="${FONT};${BUTTON_STYLE}">${escapeHtml(block.text)}</a></div>`
      : "",
} satisfies Record<string, BlockHtml>;

const footerHtml = (block: ResolvedBlock): string => {
  if (block.type !== "footer") return "";
  const links = [
    link(block.unsubscribeLabel, block.unsubscribeUrl),
    link(block.preferencesLabel, block.preferencesUrl),
  ]
    .filter(Boolean)
    .join(FOOTER_LINK_SEPARATOR);
  if (!block.text.trim() && !links) return "";
  const linkLine = links ? `<br>${links}` : "";
  return `${DIVIDER}<p style="${FOOTER_STYLE}">${escapeLines(block.text)}${linkLine}</p>`;
};

const LAYOUT_RENDERERS = {
  hero: (block) =>
    block.type === "hero" && block.imageUrl
      ? `<img src="${escapeHtml(safeUrl(block.imageUrl))}" alt="${escapeHtml(block.alt)}" style="display:block;width:100%;border-radius:8px;margin:0 0 20px">`
      : "",
  list: (block) =>
    block.type === "list"
      ? table(
          block.rows.map((item) => row(item.label, item.value, "400")).join(""),
        )
      : "",
  total: (block) =>
    block.type === "total" ? table(row(block.label, block.value, "600")) : "",
  divider: () => DIVIDER,
  footer: footerHtml,
} satisfies Record<string, BlockHtml>;

const RENDERERS: Record<ResolvedBlock["type"], BlockHtml> = {
  ...TEXT_RENDERERS,
  ...LAYOUT_RENDERERS,
};

const FOOTER_TYPE = "footer";

const renderBlocks = (blocks: ResolvedBlock[]): string =>
  blocks.map((block) => RENDERERS[block.type](block)).join("");

/**
 * The e-mail without the DMS front end: the same blocks, in the same order and
 * look as the Vue template, the footer last, under its divider.
 */
export function renderFallbackHtml(
  email: ResolvedEmail,
  locale: string,
): string {
  const body = renderBlocks(
    email.blocks.filter((block) => block.type !== FOOTER_TYPE),
  );
  const footer = renderBlocks(
    email.blocks.filter((block) => block.type === FOOTER_TYPE),
  );
  return `<!DOCTYPE html><html lang="${escapeHtml(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="${VIEWPORT}"><title>${escapeHtml(email.subject)}</title></head><body style="margin:0;background:${PAGE_COLOR};${FONT}"><span style="display:none;max-height:0;overflow:hidden">${escapeHtml(email.preheader)}</span><table role="presentation" width="100%"><tr><td align="center" style="padding:20px 0 48px"><table role="presentation" width="${CONTENT_WIDTH}" style="max-width:${CONTENT_WIDTH}px;width:100%;background:#ffffff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1)"><tr><td style="padding:40px">${body}${footer}</td></tr></table></td></tr></table></body></html>`;
}
