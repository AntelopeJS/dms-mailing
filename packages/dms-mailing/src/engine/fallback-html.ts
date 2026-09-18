import type { ResolvedBlock, ResolvedEmail } from "../types";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

const SAFE_SCHEMES = ["http:", "https:", "mailto:"];
const BLOCKED_HREF = "#";
const SCHEME_PATTERN = /^\s*([a-z][a-z0-9+.-]*):/i;

/**
 * A link target can be an interpolated variable, so it is data the sender does
 * not control. Escaping the entities keeps it inside the attribute; this keeps
 * the scheme to one a mail client may follow. A target with no scheme is
 * relative (or still an unresolved token) and passes through.
 */
export const safeUrl = (value: string): string => {
  const scheme = SCHEME_PATTERN.exec(value);
  if (!scheme) return value;
  return SAFE_SCHEMES.includes(scheme[1]!.toLowerCase() + ":")
    ? value
    : BLOCKED_HREF;
};

const FONT =
  "font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
const TEXT_COLOR = "#4c545c";
const HEADING_COLOR = "#16181b";
const BORDER_COLOR = "#e7e9ec";
const MUTED_COLOR = "#98a0a8";
const SURFACE_COLOR = "#f7f8fa";
const BUTTON_STYLE =
  "display:inline-block;padding:12px 22px;border-radius:6px;background:#111417;color:#ffffff;text-decoration:none;font-weight:600";
const CONTENT_WIDTH = 600;

type BlockHtml = (block: ResolvedBlock) => string;

const link = (label: string, href: string): string =>
  href
    ? `<a href="${escapeHtml(safeUrl(href))}" style="color:${TEXT_COLOR}">${escapeHtml(label)}</a>`
    : "";

const cellStyle = (weight: string, color: string): string =>
  `${FONT};font-size:13px;font-weight:${weight};padding:11px 14px;color:${color}`;

const TEXT_RENDERERS: Record<string, BlockHtml> = {
  heading: (block) =>
    block.type === "heading"
      ? `<h1 style="${FONT};font-size:${block.size}px;color:${HEADING_COLOR};text-align:${block.align};margin:0 0 12px">${escapeHtml(block.text)}</h1>`
      : "",
  paragraph: (block) =>
    block.type === "paragraph"
      ? `<p style="${FONT};font-size:14px;line-height:1.6;color:${TEXT_COLOR};text-align:${block.align};margin:0 0 18px">${escapeHtml(block.text)}</p>`
      : "",
  code: (block) =>
    block.type === "code"
      ? `<div style="${FONT};font-size:27px;letter-spacing:.32em;text-align:center;padding:18px;border:1px dashed ${BORDER_COLOR};border-radius:8px;margin:0 0 16px">${escapeHtml(block.text)}</div>`
      : "",
  button: (block) =>
    block.type === "button"
      ? `<div style="text-align:${block.align};margin:0 0 18px"><a href="${escapeHtml(safeUrl(block.href))}" style="${FONT};${BUTTON_STYLE}">${escapeHtml(block.text)}</a></div>`
      : "",
};

const LAYOUT_RENDERERS: Record<string, BlockHtml> = {
  hero: (block) =>
    block.type === "hero" && block.imageUrl
      ? `<img src="${escapeHtml(safeUrl(block.imageUrl))}" alt="${escapeHtml(block.alt)}" style="display:block;width:100%;border-radius:8px;margin:0 0 20px">`
      : "",
  list: (block) =>
    block.type === "list"
      ? `<table role="presentation" width="100%" style="border:1px solid ${BORDER_COLOR};border-radius:8px;margin:0 0 18px">${block.rows
          .map(
            (row) =>
              `<tr><td style="${cellStyle("400", TEXT_COLOR)}">${escapeHtml(row.label)}</td><td align="right" style="${cellStyle("400", HEADING_COLOR)}">${escapeHtml(row.value)}</td></tr>`,
          )
          .join("")}</table>`
      : "",
  total: (block) =>
    block.type === "total"
      ? `<table role="presentation" width="100%" style="margin:0 0 18px"><tr><td style="${cellStyle("600", HEADING_COLOR)};background:${SURFACE_COLOR}">${escapeHtml(block.label)}</td><td align="right" style="${cellStyle("600", HEADING_COLOR)};background:${SURFACE_COLOR}">${escapeHtml(block.value)}</td></tr></table>`
      : "",
  divider: () =>
    `<hr style="border:0;border-top:1px solid ${BORDER_COLOR};margin:10px 0 18px">`,
  footer: (block) =>
    block.type === "footer"
      ? `<div style="${FONT};font-size:11px;line-height:1.6;color:${MUTED_COLOR};border-top:1px solid ${BORDER_COLOR};padding:16px 0 0">${escapeHtml(block.text)}<br>${[
          link(block.unsubscribeLabel, block.unsubscribeUrl),
          link(block.preferencesLabel, block.preferencesUrl),
        ]
          .filter(Boolean)
          .join(" · ")}</div>`
      : "",
};

const RENDERERS: Record<ResolvedBlock["type"], BlockHtml> = {
  ...TEXT_RENDERERS,
  ...LAYOUT_RENDERERS,
} as Record<ResolvedBlock["type"], BlockHtml>;

export function renderFallbackHtml(
  email: ResolvedEmail,
  locale: string,
): string {
  const body = email.blocks
    .map((block) => RENDERERS[block.type](block))
    .join("");
  return `<!DOCTYPE html><html lang="${escapeHtml(locale)}"><head><meta charset="utf-8"><title>${escapeHtml(email.subject)}</title></head><body style="margin:0;background:${SURFACE_COLOR}"><span style="display:none;max-height:0;overflow:hidden">${escapeHtml(email.preheader)}</span><table role="presentation" width="100%"><tr><td align="center" style="padding:26px"><table role="presentation" width="${CONTENT_WIDTH}" style="max-width:${CONTENT_WIDTH}px;background:#ffffff;border-radius:10px"><tr><td style="padding:26px">${body}</td></tr></table></td></tr></table></body></html>`;
}
