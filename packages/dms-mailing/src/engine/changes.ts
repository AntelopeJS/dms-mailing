import type {
  Block,
  BlockType,
  LocaleContent,
  TemplateContent,
} from "../types";
import { walkBlocks } from "./walk";

export type TemplateChangeKind =
  | "locale_added"
  | "locale_removed"
  | "subject"
  | "preheader"
  | "block_added"
  | "block_removed"
  | "block_changed"
  | "blocks_reordered";

/** One difference between the published content and the draft, per locale. */
export interface TemplateChange {
  locale: string;
  kind: TemplateChangeKind;
  blockId?: string;
  blockType?: BlockType;
}

interface BlockSnapshot {
  type: BlockType;
  signature: string;
}

const NESTED_KEYS = new Set(["children", "elseChildren"]);

function ownFields(block: Block): string {
  const entries = Object.entries(block).filter(
    ([key]) => !NESTED_KEYS.has(key),
  );
  return JSON.stringify(entries);
}

function snapshotBlocks(blocks: Block[]): Map<string, BlockSnapshot> {
  const snapshots = new Map<string, BlockSnapshot>();
  walkBlocks(blocks, (block) => {
    snapshots.set(block.id, { type: block.type, signature: ownFields(block) });
  });
  return snapshots;
}

function orderOf(blocks: Block[]): string[] {
  const ids: string[] = [];
  walkBlocks(blocks, (block) => ids.push(block.id));
  return ids;
}

function blockChanges(
  locale: string,
  before: Map<string, BlockSnapshot>,
  after: Map<string, BlockSnapshot>,
): TemplateChange[] {
  const removed = [...before]
    .filter(([id]) => !after.has(id))
    .map(([id, snapshot]) =>
      blockChange(locale, "block_removed", id, snapshot),
    );
  const touched = [...after].flatMap(([id, snapshot]) => {
    const previous = before.get(id);
    if (!previous) return [blockChange(locale, "block_added", id, snapshot)];
    if (previous.signature === snapshot.signature) return [];
    return [blockChange(locale, "block_changed", id, snapshot)];
  });
  return [...touched, ...removed];
}

function blockChange(
  locale: string,
  kind: TemplateChangeKind,
  blockId: string,
  snapshot: BlockSnapshot,
): TemplateChange {
  return { locale, kind, blockId, blockType: snapshot.type };
}

function isReordered(before: LocaleContent, after: LocaleContent): boolean {
  const kept = new Set(orderOf(after.blocks));
  const previous = orderOf(before.blocks).filter((id) => kept.has(id));
  const surviving = new Set(previous);
  const next = orderOf(after.blocks).filter((id) => surviving.has(id));
  return previous.join() !== next.join();
}

function localeChanges(
  locale: string,
  before: LocaleContent,
  after: LocaleContent,
): TemplateChange[] {
  const changes: TemplateChange[] = [];
  if (before.subject !== after.subject)
    changes.push({ locale, kind: "subject" });
  if (before.preheader !== after.preheader)
    changes.push({ locale, kind: "preheader" });
  changes.push(
    ...blockChanges(
      locale,
      snapshotBlocks(before.blocks),
      snapshotBlocks(after.blocks),
    ),
  );
  if (isReordered(before, after))
    changes.push({ locale, kind: "blocks_reordered" });
  return changes;
}

/**
 * What publishing `draft` would change for customers who receive `published`,
 * locale by locale. An empty list means the draft carries nothing new.
 */
export function diffContents(
  published: TemplateContent,
  draft: TemplateContent,
): TemplateChange[] {
  const locales = new Set([
    ...Object.keys(published.locales),
    ...Object.keys(draft.locales),
  ]);
  return [...locales].sort().flatMap((locale) => {
    const before = published.locales[locale];
    const after = draft.locales[locale];
    if (!before) return [{ locale, kind: "locale_added" as const }];
    if (!after) return [{ locale, kind: "locale_removed" as const }];
    return localeChanges(locale, before, after);
  });
}
