import { expect } from "chai";
import { collectContentVariablePaths, contentSystemPaths } from "../../engine";
import type { FooterBlock } from "../../types";
import {
  findStarter,
  STARTER_TEMPLATES,
  starterFields,
} from "../../services/starters";
import { templateContentSchema } from "../../validation/templates.schema";
import { checkedText } from "../helpers/checked";

/** The order confirmation starter, whose test data holds amounts and lines. */
function orderStarter() {
  const starter = findStarter("order-confirmed");
  if (!starter) throw new Error("no order-confirmed starter");
  return starter;
}

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
    const fields = starterFields(STARTER_TEMPLATES[0]);
    expect(fields).to.deep.include({
      json_content: "",
      isDraftPending: true,
      publishedVersion: 0,
    });
  });

  it("writes the test amounts the way the workspace locale writes them", () => {
    const starter = orderStarter();
    const totalIn = (locale?: string) =>
      checkedText.parse(
        JSON.parse(
          checkedText.parse(starterFields(starter, locale).json_test_data),
        ).order.total,
      );
    expect(totalIn()).to.equal("€1,556.00");
    expect(totalIn("fr").replace(/\s/g, " ")).to.equal("1 556,00 €");
    expect(totalIn("not_a_locale")).to.equal("€1,556.00");
  });

  it("writes the test texts in the workspace locale's language", () => {
    const starter = orderStarter();
    const lineIn = (locale?: string) =>
      checkedText.parse(
        JSON.parse(
          checkedText.parse(starterFields(starter, locale).json_test_data),
        ).order.lines[0].name,
      );
    expect(lineIn()).to.equal("Ergo chair · Graphite × 4");
    expect(lineIn("fr-BE")).to.equal("Fauteuil ergonomique · Graphite × 4");
    expect(lineIn("de")).to.equal("Ergo chair · Graphite × 4");
  });
});
