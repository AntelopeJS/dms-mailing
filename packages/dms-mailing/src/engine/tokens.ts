import type { TemplateVariables } from "@antelopejs/interface-dms-mailing";
import { formatValue, type ValueFormat } from "./formats";
import { getPath, isPresent } from "./paths";

export const TOKEN_PATTERN = /\{\{\s*([A-Za-z0-9_.[\]]+)\s*\}\}/g;

/**
 * How a token without a value prints. `preview` keeps it visible so an author
 * sees what is missing; `send` blanks it, so a recipient never reads braces.
 */
export type InterpolationMode = "preview" | "send";

export interface InterpolationResult {
  text: string;
  missing: string[];
}

const MISSING_TOKEN: Record<InterpolationMode, (token: string) => string> = {
  preview: (token) => token,
  send: () => "",
};

export function extractTokens(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(TOKEN_PATTERN)) found.add(match[1]);
  return [...found];
}

/**
 * Replaces each token of `text` with its value in `data`, typed values
 * written for `format`'s locale (see {@link formatValue}).
 */
export function interpolate(
  text: string,
  data: TemplateVariables,
  mode: InterpolationMode = "preview",
  format?: ValueFormat,
): InterpolationResult {
  const missing = new Set<string>();
  const output = text.replace(TOKEN_PATTERN, (token, path: string) => {
    const value = getPath(data, path);
    if (!isPresent(value)) {
      missing.add(path);
      return MISSING_TOKEN[mode](token);
    }
    return formatValue(value, path, format);
  });
  return { text: output, missing: [...missing] };
}
