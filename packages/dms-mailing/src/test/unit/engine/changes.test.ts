import { expect } from "chai";
import { diffContents } from "../../../engine";
import type { Block, LocaleContent, TemplateContent } from "../../../types";

const paragraph = (id: string, text: string): Block => ({
  id,
  type: "paragraph",
  text,
  align: "left",
  visibleIf: null,
});

const locale = (subject: string, blocks: Block[]): LocaleContent => ({
  subject,
  preheader: "",
  blocks,
});

const content = (locales: Record<string, LocaleContent>): TemplateContent => ({
  locales,
});

describe("[unit] engine/changes diffContents", () => {
  it("finds nothing between two equal contents", () => {
    const same = content({ en: locale("Hi", [paragraph("a", "Hello")]) });
    expect(diffContents(same, structuredClone(same))).to.deep.equal([]);
  });

  it("names the subject, the changed block and the added one", () => {
    const published = content({ en: locale("Hi", [paragraph("a", "Hello")]) });
    const draft = content({
      en: locale("Hey", [paragraph("a", "Hello you"), paragraph("b", "New")]),
    });
    expect(diffContents(published, draft)).to.deep.equal([
      { locale: "en", kind: "subject" },
      {
        locale: "en",
        kind: "block_changed",
        blockId: "a",
        blockType: "paragraph",
      },
      {
        locale: "en",
        kind: "block_added",
        blockId: "b",
        blockType: "paragraph",
      },
    ]);
  });

  it("reports removed blocks, new and dropped locales", () => {
    const published = content({
      en: locale("Hi", [paragraph("a", "A"), paragraph("b", "B")]),
      de: locale("Hallo", []),
    });
    const draft = content({
      en: locale("Hi", [paragraph("a", "A")]),
      fr: locale("Salut", []),
    });
    expect(diffContents(published, draft)).to.deep.equal([
      { locale: "de", kind: "locale_removed" },
      {
        locale: "en",
        kind: "block_removed",
        blockId: "b",
        blockType: "paragraph",
      },
      { locale: "fr", kind: "locale_added" },
    ]);
  });

  it("notices a reorder without any field change", () => {
    const published = content({
      en: locale("Hi", [paragraph("a", "A"), paragraph("b", "B")]),
    });
    const draft = content({
      en: locale("Hi", [paragraph("b", "B"), paragraph("a", "A")]),
    });
    expect(diffContents(published, draft)).to.deep.equal([
      { locale: "en", kind: "blocks_reordered" },
    ]);
  });

  it("looks inside condition branches", () => {
    const branch = (text: string): Block => ({
      id: "if",
      type: "if",
      condition: { path: "order.isFirst", operator: "truthy", value: "" },
      children: [paragraph("inner", text)],
      elseChildren: null,
      visibleIf: null,
    });
    const changes = diffContents(
      content({ en: locale("Hi", [branch("One")]) }),
      content({ en: locale("Hi", [branch("Two")]) }),
    );
    expect(changes).to.deep.equal([
      {
        locale: "en",
        kind: "block_changed",
        blockId: "inner",
        blockType: "paragraph",
      },
    ]);
  });
});
