import { getPath, isPresent } from "./paths";

export const TOKEN_PATTERN = /\{\{\s*([A-Za-z0-9_.[\]]+)\s*\}\}/g;

export interface InterpolationResult {
  text: string;
  missing: string[];
}

export function extractTokens(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(TOKEN_PATTERN))
    found.add(match[1] as string);
  return [...found];
}

function formatValue(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function interpolate(
  text: string,
  data: Record<string, unknown>,
): InterpolationResult {
  const missing = new Set<string>();
  const output = text.replace(TOKEN_PATTERN, (token, path: string) => {
    const value = getPath(data, path);
    if (!isPresent(value)) {
      missing.add(path);
      return token;
    }
    return formatValue(value);
  });
  return { text: output, missing: [...missing] };
}
