import { expect } from "chai";
import { collectContentVariablePaths, contentSystemPaths } from "../../engine";
import type { FooterBlock } from "../../types";
import { STARTER_TEMPLATES, starterFields } from "../../services/starters";
import { templateContentSchema } from "../../validation/templates.schema";

describe("[unit] services/starters", () => {
  for (const starter of STARTER_TEMPLATES) {
    it(`ships "${starter.id}" as content the editor can save back`, () => {
      expect(() => templateContentSchema.parse(starter.content)).to.not.throw();
    });

    it(`gives the transactional "${starter.id}" a footer without unsubscribe link`, () => {
      expect(contentSystemPaths(starter.content)).to.deep.equal([]);
      for (const locale of Object.values(starter.content.locales)) {
        const footer = locale.blocks.find(
          (block): block is FooterBlock => block.type === "footer",
        );
        expect(footer?.text.trim(), starter.id).to.not.equal("");
      }
    });

    it(`declares every variable "${starter.id}" uses`, () => {
      const declared = starter.variables.map((variable) => variable.path);
      for (const path of collectContentVariablePaths(starter.content)) {
        expect(declared, path).to.include(path);
      }
    });
  }

  it("starts a template as a never-published draft", () => {
    const fields = starterFields(STARTER_TEMPLATES[0] as never);
    expect(fields).to.deep.include({
      json_content: "",
      isDraftPending: true,
      publishedVersion: 0,
    });
  });

  it("writes the test amounts the way the workspace locale writes them", () => {
    const starter = STARTER_TEMPLATES.find(
      (entry) => entry.id === "order-confirmed",
    ) as never;
    const totalIn = (locale?: string) =>
      JSON.parse(starterFields(starter, locale).json_test_data as string).order
        .total as string;
    expect(totalIn()).to.equal("€1,556.00");
    expect(totalIn("fr").replace(/\s/g, " ")).to.equal("1 556,00 €");
    expect(totalIn("not_a_locale")).to.equal("€1,556.00");
  });

  it("writes the test texts in the workspace locale's language", () => {
    const starter = STARTER_TEMPLATES.find(
      (entry) => entry.id === "order-confirmed",
    ) as never;
    const lineIn = (locale?: string) =>
      JSON.parse(starterFields(starter, locale).json_test_data as string).order
        .lines[0].name as string;
    expect(lineIn()).to.equal("Ergo chair · Graphite × 4");
    expect(lineIn("fr-BE")).to.equal("Fauteuil ergonomique · Graphite × 4");
    expect(lineIn("de")).to.equal("Ergo chair · Graphite × 4");
  });
});
