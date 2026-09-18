import type { Block, IfBlock } from "../types";

export type BlockVisitor = (block: Block, depth: number) => void;

const isIfBlock = (block: Block): block is IfBlock => block.type === "if";

export function walkBlocks(
  blocks: Block[],
  visit: BlockVisitor,
  depth = 0,
): void {
  for (const block of blocks) {
    visit(block, depth);
    if (!isIfBlock(block)) continue;
    walkBlocks(block.children, visit, depth + 1);
    walkBlocks(block.elseChildren ?? [], visit, depth + 1);
  }
}
