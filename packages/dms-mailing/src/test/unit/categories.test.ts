import { expect } from "chai";
import {
  categoryMoves,
  keptCategories,
  reassignRemovedCategories,
} from "../../services/categories";
import { categoriesSchema } from "../../validation/settings.schema";
import type { MailingTemplate } from "../../db";
import type { TemplateCategory } from "../../types";

const CATEGORIES: TemplateCategory[] = [
  { id: "orders", label: "Orders", icon: "i-ph-package" },
  { id: "billing", label: "Billing", icon: "i-ph-file-text" },
  { id: "marketing", label: "Marketing", icon: "i-ph-sparkle" },
];

const template = (id: string, category?: string): MailingTemplate =>
  ({ _id: id, category }) as MailingTemplate;

describe("[unit] services/categories reassignRemovedCategories", () => {
  it("leaves the templates of a removed category uncategorised", () => {
    const templates = [
      template("a", "orders"),
      template("b", "gone"),
      template("c"),
      template("d", "gone"),
    ];
    expect(reassignRemovedCategories(templates, CATEGORIES)).to.deep.equal([
      { templateId: "b", category: "" },
      { templateId: "d", category: "" },
    ]);
  });

  it("moves them where the form said", () => {
    const moves = new Map([["gone", "billing"]]);
    expect(
      reassignRemovedCategories(
        [template("a", "gone"), template("b", "other")],
        CATEGORIES,
        moves,
      ),
    ).to.deep.equal([
      { templateId: "a", category: "billing" },
      { templateId: "b", category: "" },
    ]);
  });

  it("names nothing when every category survives", () => {
    expect(
      reassignRemovedCategories([template("a", "orders")], CATEGORIES),
    ).to.deep.equal([]);
  });
});

describe("[unit] services/categories moves", () => {
  const entries = [
    ...CATEGORIES,
    { id: "gone", label: "Gone", icon: "i-ph-gift", moveTo: "orders" },
  ];

  it("splits the kept categories from the moved ones", () => {
    expect(keptCategories(entries)).to.deep.equal(CATEGORIES);
    expect([...categoryMoves(entries)]).to.deep.equal([["gone", "orders"]]);
  });
});

describe("[unit] validation categoriesSchema", () => {
  const parse = (value: unknown) => categoriesSchema.safeParse(value).success;
  const category = (patch: Partial<TemplateCategory>) => ({
    ...CATEGORIES[0],
    ...patch,
  });

  it("accepts the list as an array only", () => {
    expect(parse(CATEGORIES)).to.equal(true);
    expect(parse(JSON.stringify(CATEGORIES))).to.equal(false);
    expect(parse("")).to.equal(false);
  });

  it("refuses a duplicate id, a blank label, a free id or an unknown icon", () => {
    expect(parse([category({}), category({ label: "Other" })])).to.equal(false);
    expect(parse([category({ label: "   " })])).to.equal(false);
    expect(parse([category({ id: "qa st/<b>" })])).to.equal(false);
    expect(parse([category({ icon: "not-an-icon" })])).to.equal(false);
  });

  it("names the row whose label repeats an earlier one, whatever its case", () => {
    const result = categoriesSchema.safeParse([
      ...CATEGORIES,
      { id: "orders-2", label: "ORDERS", icon: "i-ph-gift" },
    ]);
    expect(result.success).to.equal(false);
    expect(result.error?.issues[0]?.path).to.deep.equal([3, "label"]);
  });

  it("refuses a list without the marketing category", () => {
    expect(parse(CATEGORIES.slice(0, 2))).to.equal(false);
    expect(
      parse([...CATEGORIES.slice(0, 2), { ...CATEGORIES[2], label: "Promos" }]),
    ).to.equal(true);
  });

  it("refuses a move to a category the list does not keep", () => {
    expect(
      parse([
        ...CATEGORIES,
        { id: "gone", label: "Gone", icon: "i-ph-gift", moveTo: "nowhere" },
      ]),
    ).to.equal(false);
  });
});
