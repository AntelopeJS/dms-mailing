import { expect } from "chai";
import {
  collectContentVariablePaths,
  collectVariablePaths,
  missingRequiredVariables,
} from "../../../engine";
import type {
  LocaleContent,
  TemplateContent,
  VariableDefinition,
} from "../../../types";

const CONTENT: LocaleContent = {
  subject: "Order {{order.ref}}",
  preheader: "",
  blocks: [
    {
      id: "h",
      type: "heading",
      text: "Hi {{customer.firstName}}",
      align: "left",
      size: 23,
      visibleIf: null,
    },
    {
      id: "l",
      type: "list",
      source: "order.lines",
      labelPath: "label",
      valuePath: "total",
      visibleIf: null,
    },
    {
      id: "i",
      type: "if",
      condition: { path: "order.hasGift", operator: "truthy", value: "" },
      visibleIf: null,
      children: [
        {
          id: "p",
          type: "paragraph",
          text: "{{gift.note}}",
          align: "left",
          visibleIf: null,
        },
      ],
      elseChildren: null,
    },
    {
      id: "b",
      type: "button",
      text: "Track",
      href: "{{order.trackUrl}}",
      align: "left",
      visibleIf: { path: "order.shipped", operator: "truthy", value: "" },
    },
    {
      id: "f",
      type: "footer",
      text: "",
      unsubscribeLabel: "u",
      preferencesLabel: "p",
      visibleIf: null,
    },
  ],
};

describe("[unit] engine/coverage", () => {
  it("collects every referenced path once, sorted, ignoring list item paths and system paths", () => {
    expect(collectVariablePaths(CONTENT)).to.deep.equal([
      "customer.firstName",
      "gift.note",
      "order.hasGift",
      "order.lines",
      "order.ref",
      "order.shipped",
      "order.trackUrl",
    ]);
  });
  it("lists declared required variables missing from a data set", () => {
    const declared: VariableDefinition[] = [
      { path: "order.ref", type: "string", required: true },
      { path: "order.lines[]", type: "array", required: true },
      { path: "customer.firstName", type: "string", required: false },
    ];
    expect(
      missingRequiredVariables(declared, { order: { ref: "X" } }),
    ).to.deep.equal(["order.lines"]);
  });
});

describe("[unit] engine/coverage across locales", () => {
  it("unions the paths of every locale, sorted and deduplicated", () => {
    const french: LocaleContent = {
      subject: "Commande {{order.ref}}",
      preheader: "",
      blocks: [
        {
          id: "p",
          type: "paragraph",
          text: "Bonjour {{customer.lastName}}",
          align: "left",
          visibleIf: null,
        },
      ],
    };
    const content: TemplateContent = { locales: { en: CONTENT, fr: french } };
    const paths = collectContentVariablePaths(content);
    expect(paths).to.include("customer.lastName");
    expect(paths).to.include("order.ref");
    expect(paths.filter((path) => path === "order.ref")).to.have.lengthOf(1);
    expect(paths).to.deep.equal([...paths].sort());
  });

  it("answers an empty list for content with no locale", () => {
    expect(collectContentVariablePaths({ locales: {} })).to.deep.equal([]);
  });
});
