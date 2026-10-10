import { expect } from "chai";
import { collectContentVariablePaths } from "../../engine";
import { STARTER_TEMPLATES, starterFields } from "../../services/starters";
import { templateContentSchema } from "../../validation/templates.schema";

describe("[unit] services/starters", () => {
  for (const starter of STARTER_TEMPLATES) {
    it(`ships "${starter.id}" as content the editor can save back`, () => {
      expect(() => templateContentSchema.parse(starter.content)).to.not.throw();
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
});
