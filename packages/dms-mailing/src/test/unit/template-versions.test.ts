import { expect } from "chai";
import type { MailingTemplate } from "../../db";
import {
  contentFieldsOf,
  isStaleRevision,
  localesWithoutSubject,
  pendingChanges,
  pickLocale,
  publishedVersionOf,
  workingContent,
  workingVariables,
} from "../../services/templates";
import type { TemplateContent } from "../../types";

const PUBLISHED = JSON.stringify({
  locales: { en: { subject: "Hi", preheader: "", blocks: [] } },
});
const DRAFT = JSON.stringify({
  locales: { en: { subject: "Hello", preheader: "", blocks: [] } },
});

const template = (extra: Partial<MailingTemplate>): MailingTemplate =>
  ({
    _id: "t1",
    status: "draft",
    json_content: PUBLISHED,
    json_variables: "[]",
    json_test_data: "{}",
    publishedVersion: extra.status === "live" ? 1 : 0,
    ...extra,
  }) as MailingTemplate;

describe("[unit] services/templates versions", () => {
  it("reads the version the last publish stored", () => {
    expect(publishedVersionOf(template({ status: "draft" }))).to.equal(0);
    expect(
      publishedVersionOf(template({ status: "live", publishedVersion: 12 })),
    ).to.equal(12);
  });

  it("works on the draft when there is one", () => {
    expect(workingContent(template({})).locales.en?.subject).to.equal("Hi");
    expect(
      workingContent(template({ json_draft: DRAFT })).locales.en?.subject,
    ).to.equal("Hello");
  });

  it("lists what a live template's draft changes", () => {
    expect(
      pendingChanges(
        template({ status: "live", publishedVersion: 3, json_draft: DRAFT }),
      ),
    ).to.deep.equal([{ locale: "en", kind: "subject" }]);
    expect(pendingChanges(template({ status: "live" }))).to.deep.equal([]);
  });

  it("declares the draft's variables, else the published ones", () => {
    const declared = JSON.stringify([
      { path: "order.id", type: "string", required: true },
    ]);
    const drafted = JSON.stringify([
      { path: "order.id", type: "string", required: false },
    ]);
    const live = { status: "live" as const, json_variables: declared };
    expect(workingVariables(template(live))[0]?.required).to.equal(true);
    expect(
      workingVariables(template({ ...live, json_variables_draft: drafted })),
    ).to.deep.equal(JSON.parse(declared));
    expect(
      workingVariables(
        template({ ...live, json_draft: DRAFT, json_variables_draft: drafted }),
      )[0]?.required,
    ).to.equal(false);
  });

  it("counts a declaration change as a change of the draft", () => {
    const row = template({
      status: "live",
      publishedVersion: 2,
      json_draft: PUBLISHED,
      json_variables_draft: JSON.stringify([
        { path: "order.id", type: "string", required: true },
      ]),
    });
    expect(pendingChanges(row)).to.deep.equal([
      { locale: "", kind: "variable_added", variable: "order.id" },
    ]);
  });

  it("copies the working content as a never-published draft", () => {
    const fields = contentFieldsOf(
      template({ status: "live", publishedVersion: 4, json_draft: DRAFT }),
    );
    expect(fields).to.deep.include({
      json_content: "",
      json_draft: DRAFT,
      isDraftPending: true,
      publishedVersion: 0,
      draftRevision: 0,
      locales: "en",
    });
  });

  it("refuses only a writer behind the stored draft revision", () => {
    const row = template({ draftRevision: 4 });
    expect(isStaleRevision(row, 4)).to.equal(false);
    expect(isStaleRevision(row, 3)).to.equal(true);
    expect(isStaleRevision(row, undefined)).to.equal(false);
  });

  it("names the locales whose subject is blank", () => {
    const content: TemplateContent = {
      locales: {
        en: { subject: "Hi", preheader: "", blocks: [] },
        fr: { subject: "  ", preheader: "", blocks: [] },
      },
    };
    expect(localesWithoutSubject(content)).to.deep.equal(["fr"]);
  });
});

describe("[unit] services/templates pickLocale", () => {
  const content: TemplateContent = {
    locales: {
      en: { subject: "Hi", preheader: "", blocks: [] },
      fr: { subject: "Salut", preheader: "", blocks: [] },
    },
  };

  it("matches a regional or upper-case request to its base language", () => {
    expect(pickLocale(content, "fr-BE", "en")).to.equal("fr");
    expect(pickLocale(content, "FR", "en")).to.equal("fr");
    expect(pickLocale(content, "fr_CA", "en")).to.equal("fr");
  });

  it("falls back to the tenant locale for a language the template lacks", () => {
    expect(pickLocale(content, "de-AT", "fr")).to.equal("fr");
    expect(pickLocale(content, undefined, "en")).to.equal("en");
  });
});
