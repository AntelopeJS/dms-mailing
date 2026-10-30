import { expect } from "chai";
import { z } from "zod";
import {
  categoriesIn,
  categoryMoves,
  keptCategories,
  reassignRemovedCategories,
} from "../../services/categories";
import { mailingSettingsForm } from "../../pages/settings/form";
import { categoriesSchema } from "../../validation/settings.schema";
import type { MailingTemplate } from "../../db";
import { templateRow } from "../helpers/rows";
import type { TemplateCategory } from "../../types";

const CATEGORIES: TemplateCategory[] = [
  {
    id: "orders",
    label: { en: "Orders", fr: "Commandes" },
    icon: "i-ph-package",
  },
  { id: "billing", label: { en: "Billing" }, icon: "i-ph-file-text" },
  { id: "marketing", label: { en: "Marketing" }, icon: "i-ph-sparkle" },
];

const LABEL_REQUIRED = "$dms_mailing.settings.categories.label_required";
const LABEL_DUPLICATE = "$dms_mailing.settings.categories.label_duplicate";

const categoriesFormSchema = z.object({
  properties: z.object({
    categories: z.object({
      anyOf: z.array(
        z.object({
          items: z
            .object({
              properties: z.object({
                label: z.object({
                  additionalProperties: z.record(z.unknown()).optional(),
                }),
              }),
            })
            .optional(),
        }),
      ),
    }),
  }),
});

const template = (id: string, category?: string): MailingTemplate =>
  templateRow({ _id: id, category });

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
    { id: "gone", label: { en: "Gone" }, icon: "i-ph-gift", moveTo: "orders" },
  ];

  it("splits the kept categories from the moved ones", () => {
    expect(keptCategories(entries)).to.deep.equal(CATEGORIES);
    expect([...categoryMoves(entries)]).to.deep.equal([["gone", "orders"]]);
  });
});

describe("[unit] services/categories labels per language", () => {
  it("reads each label in the reader's language, else in English", () => {
    expect(
      categoriesIn(CATEGORIES, "fr").map(({ label }) => label),
    ).to.deep.equal(["Commandes", "Billing", "Marketing"]);
  });
});

describe("[unit] validation categoriesSchema", () => {
  const parse = (value: string | z.input<typeof categoriesSchema>) =>
    categoriesSchema.safeParse(value).success;
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
    expect(
      parse([category({}), category({ label: { en: "Other" } })]),
    ).to.equal(false);
    expect(parse([category({ label: { en: "   " } })])).to.equal(false);
    expect(parse([category({ id: "qa st/<b>" })])).to.equal(false);
    expect(parse([category({ icon: "not-an-icon" })])).to.equal(false);
  });

  it("names the row whose label repeats an earlier one, whatever its case", () => {
    const result = categoriesSchema.safeParse([
      ...CATEGORIES,
      { id: "orders-2", label: { en: "ORDERS" }, icon: "i-ph-gift" },
    ]);
    expect(result.success).to.equal(false);
    expect(result.error?.issues[0]?.path).to.deep.equal([3, "label"]);
  });

  it("holds the label rules in every language the list writes", () => {
    const result = categoriesSchema.safeParse([
      ...CATEGORIES,
      {
        id: "orders-2",
        label: { en: "Purchases", fr: "commandes" },
        icon: "i-ph-gift",
      },
    ]);
    expect(result.error?.issues.map(({ path }) => path)).to.deep.equal([
      [3, "label"],
    ]);
  });

  it("names every blank row and every repeated one in one pass", () => {
    const result = categoriesSchema.safeParse([
      ...CATEGORIES,
      { id: "category", label: { en: "  " }, icon: "i-ph-gift" },
      { id: "orders-2", label: { en: "Orders" }, icon: "i-ph-gift" },
    ]);
    expect(
      result.error?.issues.map(({ path, message }) => ({ path, message })),
    ).to.deep.equal([
      { path: [3, "label"], message: LABEL_REQUIRED },
      { path: [4, "label"], message: LABEL_DUPLICATE },
    ]);
  });

  it("leaves the label's minimum out of the form's own check", () => {
    const schema = categoriesFormSchema.parse(
      mailingSettingsForm.serializeSync().options?.schema,
    );
    const [list] = schema.properties.categories.anyOf;
    const label = list?.items?.properties.label;
    expect(label?.additionalProperties).to.have.property("maxLength");
    expect(label?.additionalProperties).to.not.have.property("minLength");
  });

  it("refuses a list without the marketing category", () => {
    expect(parse(CATEGORIES.slice(0, 2))).to.equal(false);
    expect(
      parse([
        ...CATEGORIES.slice(0, 2),
        { ...CATEGORIES[2], label: { en: "Promos" } },
      ]),
    ).to.equal(true);
  });

  it("refuses a move to a category the list does not keep", () => {
    expect(
      parse([
        ...CATEGORIES,
        {
          id: "gone",
          label: { en: "Gone" },
          icon: "i-ph-gift",
          moveTo: "nowhere",
        },
      ]),
    ).to.equal(false);
  });
});
