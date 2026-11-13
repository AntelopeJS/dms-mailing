"use strict";

const { expect } = require("chai");
const { DEFAULT_TENANT_ID } = require("@antelopejs/interface-dms/constants");
const { declaration } = require("../helpers/declarations");

const stamp = Date.now();
const slug = `untyped-tenant-${stamp}`;

async function refusalOf(call) {
  try {
    await call();
  } catch (reason) {
    return reason;
  }
  return undefined;
}

describe("[integration] declarations called from JavaScript without a tenant", () => {
  it("refuses each call before writing", async () => {
    const {
      DeclareTemplate,
      DeclareTemplateCategory,
      ImportSends,
    } = require("@antelopejs/interface-dms-mailing");
    const { GetModel } = require("@antelopejs/interface-database-decorators");
    const { TemplateModel } = require("../../db");
    const { tenantId: _tenantId, ...withoutTenant } = declaration(slug);
    const calls = [
      ["invalid_template", () => DeclareTemplate(withoutTenant)],
      [
        "invalid_category",
        () =>
          DeclareTemplateCategory({
            id: `untyped-${stamp}`,
            label: { en: "Untyped tenant" },
            icon: "i-ph-tag",
          }),
      ],
      [
        "invalid_import",
        () =>
          ImportSends({
            sends: [
              {
                importId: `untyped-${stamp}`,
                templateSlug: slug,
                to: "untyped@example.test",
                sentAt: new Date(),
              },
            ],
          }),
      ],
    ];
    for (const [code, call] of calls) {
      const error = await refusalOf(call);
      expect(error, code).to.include({ code });
      expect(error, code).to.have.property("message").that.includes("tenantId");
    }
    const rows = await GetModel(TemplateModel, DEFAULT_TENANT_ID).getBy(
      "slug",
      slug,
    );
    expect(rows).to.deep.equal([]);
  });
});
