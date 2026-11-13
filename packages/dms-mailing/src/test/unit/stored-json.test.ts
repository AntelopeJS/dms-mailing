import { expect } from "chai";
import type { MailingTemplateVersion } from "../../db";
import { committedVersionOf } from "../../db/models/template-versions.model";
import { diffContents, diffVariables } from "../../engine";
import {
  parseContent,
  parseTestData,
  parseVariables,
  parseVersionChanges,
  parseVersionContent,
  parseVersionVariables,
  workingContent,
  workingVariables,
} from "../../services/templates";
import type { TemplateContent, VariableDefinition } from "../../types";
import { templateRow } from "../helpers/rows";

const CONDITION = {
  path: "customer.vip",
  operator: "eq",
  value: "yes",
} as const;

const CONTENT: TemplateContent = {
  locales: {
    en: {
      subject: "  Your order  ",
      preheader: "",
      blocks: [
        { id: "b1", type: "hero", visibleIf: null, imageUrl: "", alt: "" },
        {
          id: "b2",
          type: "heading",
          visibleIf: CONDITION,
          text: "Hi",
          align: "left",
          size: 96,
        },
        {
          id: "b3",
          type: "paragraph",
          visibleIf: null,
          text: "",
          align: "center",
        },
        { id: "b4", type: "code", visibleIf: null, text: "{{code}}" },
        {
          id: "b5",
          type: "list",
          visibleIf: null,
          source: "items",
          labelPath: "name",
          valuePath: "price",
        },
        { id: "b6", type: "total", visibleIf: null, label: "Total", value: "" },
        {
          id: "b7",
          type: "if",
          visibleIf: null,
          condition: CONDITION,
          children: [
            {
              id: "b8",
              type: "button",
              visibleIf: null,
              text: "Open",
              href: "{{url}}",
              align: "right",
            },
          ],
          elseChildren: [{ id: "b9", type: "divider", visibleIf: null }],
        },
        {
          id: "b10",
          type: "footer",
          visibleIf: null,
          text: "",
          unsubscribeLabel: "",
          preferencesLabel: "",
        },
      ],
    },
  },
};

const VARIABLES: VariableDefinition[] = [
  { path: "customer.vip", type: "string", required: false },
  { path: "items", type: "array", required: true },
];

const DRAFT = JSON.stringify(CONTENT);
const WRONG_CONTENT = JSON.stringify({ locales: { en: { subject: 1 } } });
const WRONG_VARIABLES = JSON.stringify([{ path: "x", type: "colour" }]);

function versionRow(
  fields: Partial<MailingTemplateVersion> = {},
): MailingTemplateVersion {
  return {
    _id: "version",
    templateId: "template",
    version: 1,
    json_content: DRAFT,
    json_variables: JSON.stringify(VARIABLES),
    locales: "en",
    publishedAt: new Date(0),
    publishedBy: "",
    json_changes: "[]",
    ...fields,
  };
}

describe("[unit] stored JSON reads back what the module wrote", () => {
  it("reads every block kind of a content unchanged, bounds and spaces kept", () => {
    expect(parseContent(templateRow({ json_content: DRAFT }))).to.deep.equal(
      CONTENT,
    );
    expect(workingContent(templateRow({ json_draft: DRAFT }))).to.deep.equal(
      CONTENT,
    );
    expect(parseVersionContent(versionRow())).to.deep.equal(CONTENT);
  });

  it("reads declarations, test data and the changes a publish computed unchanged", () => {
    const variables = JSON.stringify(VARIABLES);
    expect(
      parseVariables(templateRow({ json_variables: variables })),
    ).to.deep.equal(VARIABLES);
    expect(
      workingVariables(
        templateRow({ json_draft: DRAFT, json_variables_draft: variables }),
      ),
    ).to.deep.equal(VARIABLES);
    expect(parseVersionVariables(versionRow())).to.deep.equal(VARIABLES);
    const data = { customer: { vip: "yes" }, items: [{ name: "A", n: 1 }] };
    expect(
      parseTestData(templateRow({ json_test_data: JSON.stringify(data) })),
    ).to.deep.equal(data);
    const changes = [
      ...diffContents({ locales: {} }, CONTENT),
      ...diffVariables([], VARIABLES),
    ];
    expect(
      parseVersionChanges(
        versionRow({ json_changes: JSON.stringify(changes) }),
      ),
    ).to.deep.equal(changes);
  });

  it("reads the committed version row with its publication date", () => {
    const row = versionRow({ publishedAt: new Date("2026-11-12T10:00:00Z") });
    expect(
      committedVersionOf({ json_published_version: JSON.stringify(row) }),
    ).to.deep.equal(row);
  });
});

describe("[unit] stored JSON keeps the keys its type does not name", () => {
  const block = '{"id":"b","type":"divider","visibleIf":null,"note":"x"}';
  const content = `{"locales":{"en":{"subject":"s","preheader":"","blocks":[${block}],"theme":"dark"}},"layout":1}`;
  const variables = '[{"path":"a","type":"string","required":true,"hint":"x"}]';
  const changes =
    '[{"locale":"","kind":"variable_added","variable":"a","by":"x"}]';

  it("reads content, declarations and changes back with every extra key", () => {
    const keptContent: unknown = JSON.parse(content);
    const keptVariables: unknown = JSON.parse(variables);
    const keptChanges: unknown = JSON.parse(changes);
    expect(parseContent(templateRow({ json_content: content }))).to.deep.equal(
      keptContent,
    );
    expect(
      parseVariables(templateRow({ json_variables: variables })),
    ).to.deep.equal(keptVariables);
    expect(
      parseVersionChanges(versionRow({ json_changes: changes })),
    ).to.deep.equal(keptChanges);
  });

  it("reads a committed version row back with every extra key", () => {
    const fields = {
      _id: "version",
      templateId: "template",
      version: 1,
      json_content: DRAFT,
      json_variables: "[]",
      locales: "en",
      publishedBy: "",
      json_changes: "[]",
      legacy: 1,
    };
    const publishedAt = new Date("2026-11-12T10:00:00Z");
    const stored = JSON.stringify({ ...fields, publishedAt });
    expect(
      committedVersionOf({ json_published_version: stored }),
    ).to.deep.equal({ ...fields, publishedAt });
  });
});

describe("[unit] stored JSON refuses a malformed row", () => {
  const refusals: Array<[string, () => void]> = [
    [
      "json_content",
      () => parseContent(templateRow({ json_content: WRONG_CONTENT })),
    ],
    [
      "json_draft",
      () => workingContent(templateRow({ json_draft: WRONG_CONTENT })),
    ],
    [
      "json_variables",
      () => parseVariables(templateRow({ json_variables: WRONG_VARIABLES })),
    ],
    [
      "json_variables_draft",
      () =>
        workingVariables(
          templateRow({ json_draft: DRAFT, json_variables_draft: "{}" }),
        ),
    ],
    [
      "json_test_data",
      () => parseTestData(templateRow({ json_test_data: "[1]" })),
    ],
    [
      "a version's json_content",
      () => parseVersionContent(versionRow({ json_content: WRONG_CONTENT })),
    ],
    [
      "a version's json_variables",
      () =>
        parseVersionVariables(versionRow({ json_variables: WRONG_VARIABLES })),
    ],
    [
      "a version's json_changes",
      () =>
        parseVersionChanges(
          versionRow({ json_changes: '[{"locale":"en","kind":"renamed"}]' }),
        ),
    ],
    [
      "json_published_version",
      () =>
        committedVersionOf({
          json_published_version: JSON.stringify({ _id: "v", version: "1" }),
        }),
    ],
  ];

  for (const [column, read] of refusals) {
    it(`refuses ${column} that does not hold its type`, () => {
      expect(read).to.throw(TypeError);
    });
  }
});
