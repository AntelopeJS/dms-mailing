import { expect } from "chai";
import {
  parseCategories,
  reassignRemovedCategories,
} from "../../services/categories";
import type { MailingTemplate } from "../../db";
import type { TemplateCategory } from "../../types";

const CATEGORIES: TemplateCategory[] = [
  { id: "orders", label: "Orders", icon: "i-ph-package" },
  { id: "billing", label: "Billing", icon: "i-ph-file-text" },
];

const template = (id: string, category?: string): MailingTemplate =>
  ({ _id: id, category }) as MailingTemplate;

describe("[unit] services/categories parseCategories", () => {
  it("reads the list the form field stores, as a string or an array", () => {
    expect(parseCategories(JSON.stringify(CATEGORIES))).to.deep.equal(
      CATEGORIES,
    );
    expect(parseCategories(CATEGORIES)).to.deep.equal(CATEGORIES);
  });

  it("answers an empty list for blank or broken input", () => {
    expect(parseCategories("")).to.deep.equal([]);
    expect(parseCategories("not json")).to.deep.equal([]);
    expect(parseCategories(undefined)).to.deep.equal([]);
  });
});

describe("[unit] services/categories reassignRemovedCategories", () => {
  it("names the templates whose category no longer exists", () => {
    const templates = [
      template("a", "orders"),
      template("b", "gone"),
      template("c"),
      template("d", "gone"),
    ];
    expect(reassignRemovedCategories(templates, CATEGORIES)).to.deep.equal([
      "b",
      "d",
    ]);
  });

  it("names nothing when every category survives", () => {
    expect(
      reassignRemovedCategories([template("a", "orders")], CATEGORIES),
    ).to.deep.equal([]);
  });
});
