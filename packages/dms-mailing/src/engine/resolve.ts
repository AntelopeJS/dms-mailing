import {
  PREFERENCES_URL_PATH,
  SYSTEM_VARIABLE_PATHS,
  UNSUBSCRIBE_URL_PATH,
} from "../constants";
import type {
  Block,
  FooterBlock,
  IfBlock,
  ListBlock,
  LocaleContent,
  ResolvedBlock,
  ResolvedEmail,
  ResolvedListRow,
} from "../types";
import { evaluateCondition } from "./conditions";
import { safeUrl } from "./fallback-html";
import { getPath, isPresent } from "./paths";
import { footerLinkPaths } from "./system-variables";
import { type InterpolationMode, interpolate } from "./tokens";

type Data = Record<string, unknown>;

interface ResolveState {
  data: Data;
  mode: InterpolationMode;
  missing: Set<string>;
  hidden: string[];
}

/** A blocked image source: the hero is left out rather than drawn broken. */
const BLOCKED_IMAGE = "";

type BlockResolver = (block: Block, state: ResolveState) => ResolvedBlock[];

function text(state: ResolveState, value: string): string {
  const result = interpolate(value, state.data, state.mode);
  for (const path of result.missing) state.missing.add(path);
  return result.text;
}

/**
 * A link or image target, filtered here so both renderers (the Vue e-mail
 * and the fallback) receive a scheme a mail client may follow.
 */
function url(state: ResolveState, value: string, blocked?: string): string {
  return safeUrl(text(state, value), blocked);
}

/**
 * A footer link's target, read from the data the caller passed. A link whose
 * label was cleared is left out, whatever URL the caller gave.
 */
function systemUrl(
  state: ResolveState,
  block: FooterBlock,
  path: string,
): string {
  if (!footerLinkPaths(block).includes(path)) return "";
  const value = getPath(state.data, path);
  return isPresent(value) ? safeUrl(String(value)) : "";
}

function cell(item: unknown, path: string): string {
  const value = getPath(item, path);
  return isPresent(value) ? String(value) : "";
}

function listRows(block: ListBlock, state: ResolveState): ResolvedListRow[] {
  const source = getPath(state.data, block.source);
  if (!Array.isArray(source)) {
    state.missing.add(block.source);
    return [];
  }
  return source.map((item) => ({
    label: cell(item, block.labelPath),
    value: cell(item, block.valuePath),
  }));
}

function branch(block: IfBlock, state: ResolveState): ResolvedBlock[] {
  const isTrue = evaluateCondition(block.condition, state.data);
  const chosen = isTrue ? block.children : (block.elseChildren ?? []);
  const skipped = isTrue ? (block.elseChildren ?? []) : block.children;
  for (const child of skipped) state.hidden.push(child.id);
  return resolveBlocks(chosen, state);
}

const RESOLVERS: Record<Block["type"], BlockResolver> = {
  hero: (block, state) =>
    block.type === "hero"
      ? [
          {
            id: block.id,
            type: "hero",
            imageUrl: url(state, block.imageUrl, BLOCKED_IMAGE),
            alt: text(state, block.alt),
          },
        ]
      : [],
  heading: (block, state) =>
    block.type === "heading"
      ? [
          {
            id: block.id,
            type: "heading",
            text: text(state, block.text),
            align: block.align,
            size: block.size,
          },
        ]
      : [],
  paragraph: (block, state) =>
    block.type === "paragraph"
      ? [
          {
            id: block.id,
            type: "paragraph",
            text: text(state, block.text),
            align: block.align,
          },
        ]
      : [],
  code: (block, state) =>
    block.type === "code"
      ? [{ id: block.id, type: "code", text: text(state, block.text) }]
      : [],
  list: (block, state) =>
    block.type === "list"
      ? [{ id: block.id, type: "list", rows: listRows(block, state) }]
      : [],
  total: (block, state) =>
    block.type === "total"
      ? [
          {
            id: block.id,
            type: "total",
            label: text(state, block.label),
            value: text(state, block.value),
          },
        ]
      : [],
  button: (block, state) =>
    block.type === "button"
      ? [
          {
            id: block.id,
            type: "button",
            text: text(state, block.text),
            href: url(state, block.href),
            align: block.align,
          },
        ]
      : [],
  if: (block, state) => (block.type === "if" ? branch(block, state) : []),
  divider: (block) => [{ id: block.id, type: "divider" }],
  footer: (block, state) =>
    block.type === "footer"
      ? [
          {
            id: block.id,
            type: "footer",
            text: text(state, block.text),
            unsubscribeLabel: block.unsubscribeLabel,
            preferencesLabel: block.preferencesLabel,
            unsubscribeUrl: systemUrl(state, block, UNSUBSCRIBE_URL_PATH),
            preferencesUrl: systemUrl(state, block, PREFERENCES_URL_PATH),
          },
        ]
      : [],
};

/**
 * Visibility decides before a block is resolved, not after: resolving first
 * would record a hidden block's unresolved paths in `state.missing`, and
 * `blockOnMissingVariables` refuses a send on that set, so a hidden block
 * could block a send over a variable it never rendered.
 */
function resolveBlocks(blocks: Block[], state: ResolveState): ResolvedBlock[] {
  return blocks.flatMap((block) => {
    if (block.visibleIf && !evaluateCondition(block.visibleIf, state.data)) {
      state.hidden.push(block.id);
      return [];
    }
    return RESOLVERS[block.type](block, state);
  });
}

const isUserPath = (path: string): boolean =>
  !SYSTEM_VARIABLE_PATHS.includes(path);

/**
 * Resolves `content` against `data`. A real send passes `send` so a missing
 * value leaves a blank; previews keep the token visible.
 */
export function resolveEmail(
  content: LocaleContent,
  data: Data,
  mode: InterpolationMode = "preview",
): ResolvedEmail {
  const state: ResolveState = { data, mode, missing: new Set(), hidden: [] };
  const subject = text(state, content.subject);
  const preheader = text(state, content.preheader);
  const blocks = resolveBlocks(content.blocks, state);
  return {
    subject,
    preheader,
    blocks,
    missing: [...state.missing].filter(isUserPath).sort(),
    hiddenBlockIds: state.hidden,
  };
}
