import { expect } from "chai";
import type { MailingTemplate } from "../../db";
import {
  contentFieldsOf,
  pendingChanges,
  publishedVersionOf,
  workingContent,
} from "../../services/templates";

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
    ...extra,
  }) as MailingTemplate;

describe("[unit] services/templates versions", () => {
  it("reads a live row written before versions as v1", () => {
    expect(publishedVersionOf(template({ status: "live" }))).to.equal(1);
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

  it("copies the working content as a never-published draft", () => {
    const fields = contentFieldsOf(
      template({ status: "live", publishedVersion: 4, json_draft: DRAFT }),
    );
    expect(fields).to.deep.include({
      json_content: "",
      json_draft: DRAFT,
      isDraftPending: true,
      publishedVersion: 0,
      locales: "en",
    });
  });
});
