import { SYSTEM_VARIABLE_PATHS } from "../constants";
import type {
  Block,
  LocaleContent,
  TemplateContent,
  VariableDefinition,
} from "../types";
import { getPath, isPresent, normalizePath } from "./paths";
import { extractTokens } from "./tokens";
import { walkBlocks } from "./walk";

type PathCollector = (block: Block) => string[];

const textTokens = (...texts: string[]): string[] =>
  texts.flatMap(extractTokens);

const COLLECTORS: Record<Block["type"], PathCollector> = {
  hero: (block) =>
    block.type === "hero" ? textTokens(block.imageUrl, block.alt) : [],
  heading: (block) => (block.type === "heading" ? textTokens(block.text) : []),
  paragraph: (block) =>
    block.type === "paragraph" ? textTokens(block.text) : [],
  code: (block) => (block.type === "code" ? textTokens(block.text) : []),
  list: (block) => (block.type === "list" ? [normalizePath(block.source)] : []),
  total: (block) =>
    block.type === "total" ? textTokens(block.label, block.value) : [],
  button: (block) =>
    block.type === "button" ? textTokens(block.text, block.href) : [],
  if: (block) =>
    block.type === "if" ? [normalizePath(block.condition.path)] : [],
  divider: () => [],
  footer: (block) => (block.type === "footer" ? textTokens(block.text) : []),
};

const isUserPath = (path: string): boolean =>
  !SYSTEM_VARIABLE_PATHS.includes(path);

export function collectVariablePaths(content: LocaleContent): string[] {
  const paths = new Set<string>(textTokens(content.subject, content.preheader));
  walkBlocks(content.blocks, (block) => {
    for (const path of COLLECTORS[block.type](block)) {
      paths.add(normalizePath(path));
    }
    if (block.visibleIf) paths.add(normalizePath(block.visibleIf.path));
  });
  return [...paths].filter(isUserPath).sort();
}

/** Every variable path the content references, across all of its locales. */
export function collectContentVariablePaths(
  content: TemplateContent,
): string[] {
  const paths = Object.values(content.locales).flatMap((locale) =>
    collectVariablePaths(locale),
  );
  return [...new Set(paths)].sort();
}

export function missingRequiredVariables(
  declared: VariableDefinition[],
  data: Record<string, unknown>,
): string[] {
  return declared
    .filter((variable) => variable.required)
    .map((variable) => normalizePath(variable.path))
    .filter((path) => !isPresent(getPath(data, path)));
}
