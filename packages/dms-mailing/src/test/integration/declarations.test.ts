import { expect } from "chai";
import type {
  TemplateContent,
  TemplateDeclaration,
} from "@antelopejs/interface-dms-mailing";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const TABLE = "/api/mailing/tables/templates";
const TEMPLATES = "/api/mailing/templates";
const RECIPIENT = "declared@example.test";

type Client = ReturnType<typeof authorizedClient>;

async function client(): Promise<Client> {
  const session = await ensureOwnerSession();
  return authorizedClient(session.accessToken);
}

function contentWith(subject: string): TemplateContent {
  return {
    locales: {
      en: {
        subject,
        preheader: "",
        blocks: [
          {
            id: "intro",
            type: "paragraph",
            text: "Hello {{customer.firstName}}",
            align: "left",
            visibleIf: null,
          },
        ],
      },
    },
  };
}

function declaration(
  slug: string,
  overrides: Partial<TemplateDeclaration> = {},
): TemplateDeclaration {
  return {
    slug,
    name: `Declared ${slug}`,
    category: "orders",
    content: contentWith("Your order is ready"),
    variables: [{ path: "customer.firstName", type: "string", required: true }],
    testData: { customer: { firstName: "Sofie" } },
    author: "Release script",
    ...overrides,
  };
}

async function mailing() {
  return import("@antelopejs/interface-dms-mailing");
}

async function versionsOf(api: Client, id: string): Promise<number[]> {
  const history = await api.get(`${TEMPLATES}/${id}/versions`);
  expect(history.status, JSON.stringify(history.data)).to.equal(HTTP_OK);
  return (history.data.versions as { version: number }[]).map(
    (row) => row.version,
  );
}

async function rowsWithSlug(slug: string): Promise<number> {
  const { GetModel } =
    await import("@antelopejs/interface-database-decorators");
  const { DEFAULT_TENANT_ID } =
    await import("@antelopejs/interface-dms/constants");
  const { TemplateModel, TemplateSlugModel, templateSlugIdOf } =
    await import("../../db");
  const rows = await GetModel(TemplateModel, DEFAULT_TENANT_ID).getBy(
    "slug",
    slug,
  );
  const claim = await GetModel(TemplateSlugModel, DEFAULT_TENANT_ID).get(
    templateSlugIdOf(DEFAULT_TENANT_ID, slug),
  );
  expect(claim?.templateId, "the slug claim").to.equal(rows[0]?._id);
  return rows.length;
}

describe("[integration] template declarations", () => {
  const stamp = Date.now();

  it("creates a live template SendTemplate can use, once", async () => {
    const { DeclareTemplate, SendTemplate } = await mailing();
    const slug = `declared-create-${stamp}`;
    const first = await DeclareTemplate(declaration(slug));
    expect(first).to.include({ slug, outcome: "created", version: 1 });

    const again = await Promise.all([
      DeclareTemplate(declaration(slug)),
      DeclareTemplate(declaration(slug)),
    ]);
    expect(again.map((result) => result.outcome)).to.deep.equal([
      "unchanged",
      "unchanged",
    ]);
    expect(await rowsWithSlug(slug)).to.equal(1);

    const { DEFAULT_TENANT_ID } =
      await import("@antelopejs/interface-dms/constants");
    const sent = await SendTemplate(slug, {
      tenantId: DEFAULT_TENANT_ID,
      to: RECIPIENT,
      variables: { customer: { firstName: "Sofie" } },
    });
    expect(sent.status, sent.error).to.not.equal("failed");

    const api = await client();
    const content = await api.get(`${TEMPLATES}/${first.templateId}/content`);
    expect(content.data.template).to.include({
      status: "live",
      name: `Declared ${slug}`,
      category: "orders",
      updatedBy: "Release script",
    });
    expect(content.data.hasDraft).to.equal(false);
    expect(content.data.testData).to.deep.equal({
      customer: { firstName: "Sofie" },
    });
    expect(content.data.publishedVariables).to.have.length(1);
    expect(await versionsOf(api, first.templateId)).to.deep.equal([1]);
  });

  it("creates declarations racing on a fresh slug only once", async () => {
    const { DeclareTemplate } = await mailing();
    const slug = `declared-race-${stamp}`;
    const results = await Promise.all(
      Array.from({ length: 4 }, () => DeclareTemplate(declaration(slug))),
    );
    const outcomes = results.map((result) => result.outcome).sort();
    expect(outcomes).to.deep.equal([
      "created",
      "unchanged",
      "unchanged",
      "unchanged",
    ]);
    expect(results.map((result) => result.version)).to.deep.equal([1, 1, 1, 1]);
    expect(await rowsWithSlug(slug)).to.equal(1);
  });

  it("publishes a changed declaration over an untouched template", async () => {
    const { DeclareTemplate } = await mailing();
    const slug = `declared-update-${stamp}`;
    const created = await DeclareTemplate(declaration(slug));
    const updated = await DeclareTemplate(
      declaration(slug, {
        name: "Renamed",
        content: contentWith("Your new order is ready"),
      }),
    );
    expect(updated).to.include({ outcome: "updated", version: 2 });
    const api = await client();
    const content = await api.get(`${TEMPLATES}/${created.templateId}/content`);
    expect(content.data.template.name).to.equal("Renamed");
    expect(content.data.publishedContent.locales.en.subject).to.equal(
      "Your new order is ready",
    );
    expect(await versionsOf(api, created.templateId)).to.deep.equal([2, 1]);
  });

  it("finishes a declaration whose creator failed immediately after inserting its seed", async () => {
    const { DeclareTemplate } = await mailing();
    const { TemplateModel } = await import("../../db");
    const slug = `declared-interrupted-${stamp}`;
    // Retain the original for fault injection; invoke it with the model receiver.
    // oxlint-disable-next-line typescript/unbound-method
    const insert = TemplateModel.prototype.insert;
    TemplateModel.prototype.insert = async function (fields, options) {
      const ids = await insert.call(this, fields, options);
      if (!Array.isArray(fields) && fields.slug === slug)
        throw new Error("Interrupted after seed insert");
      return ids;
    };
    try {
      const error = await DeclareTemplate(declaration(slug)).catch(
        (reason: Error) => reason,
      );
      expect(error).to.be.instanceOf(Error);
    } finally {
      TemplateModel.prototype.insert = insert;
    }
    const resumed = await DeclareTemplate(declaration(slug));
    expect(resumed).to.include({ outcome: "created", version: 1 });
    expect(await rowsWithSlug(slug)).to.equal(1);
    expect(await versionsOf(await client(), resumed.templateId)).to.deep.equal([
      1,
    ]);
  });

  it("preserves edits made after a declaration read its publication snapshot", async () => {
    const { DeclareTemplate } = await mailing();
    const { TemplateModel } = await import("../../db");
    const api = await client();
    const edits = [
      async (id: string) =>
        api.post(`${TEMPLATES}/${id}/content`, {
          content: contentWith("User draft"),
        }),
      async (id: string) => api.post(`${TEMPLATES}/${id}/archive`, {}),
      async (id: string) =>
        api.put(`${TABLE}/edit?id=${id}`, {
          name: "User name",
          category: "billing",
        }),
      async (id: string) =>
        api.post(`${TEMPLATES}/${id}/test-data`, { data: { user: true } }),
      async (id: string) => {
        const saved = await api.post(`${TEMPLATES}/${id}/content`, {
          content: contentWith("User publication"),
        });
        expect(saved.status).to.equal(HTTP_OK);
        return api.post(`${TEMPLATES}/${id}/publish`, {});
      },
    ];
    for (const [index, edit] of edits.entries()) {
      const slug = `declared-user-race-${index}-${stamp}`;
      const created = await DeclareTemplate(declaration(slug));
      // Invoke the saved implementation with the original receiver below.
      // oxlint-disable-next-line typescript/unbound-method
      const publish = TemplateModel.prototype.publishIfCurrent;
      let edited = false;
      TemplateModel.prototype.publishIfCurrent = async function (
        snapshot,
        patch,
      ) {
        if (snapshot._id === created.templateId && !edited) {
          edited = true;
          const response = await edit(snapshot._id);
          expect(response.status, JSON.stringify(response.data)).to.equal(
            HTTP_OK,
          );
        }
        return publish.call(this, snapshot, patch);
      };
      try {
        const result = await DeclareTemplate(
          declaration(slug, { content: contentWith("Code update") }),
        );
        const userPublished = index === edits.length - 1;
        expect(result).to.include({
          outcome: "kept",
          version: userPublished ? 2 : 1,
        });
        const content = await api.get(
          `${TEMPLATES}/${created.templateId}/content`,
        );
        expect(content.data.publishedContent.locales.en.subject).to.equal(
          userPublished ? "User publication" : "Your order is ready",
        );
        expect(await versionsOf(api, created.templateId)).to.deep.equal(
          userPublished ? [2, 1] : [1],
        );
      } finally {
        TemplateModel.prototype.publishIfCurrent = publish;
      }
    }
  });

  it("keeps committed history readable and recoverable when its insert fails", async () => {
    const { DeclareTemplate } = await mailing();
    const { GetModel } =
      await import("@antelopejs/interface-database-decorators");
    const { DEFAULT_TENANT_ID } =
      await import("@antelopejs/interface-dms/constants");
    const { TemplateVersionModel } = await import("../../db");
    const slug = `declared-history-recovery-${stamp}`;
    const first = await DeclareTemplate(declaration(slug));
    // Retain the original for fault injection; invoke it with the model receiver.
    // oxlint-disable-next-line typescript/unbound-method
    const insert = TemplateVersionModel.prototype.insert;
    TemplateVersionModel.prototype.insert = async function (fields, options) {
      if (
        !Array.isArray(fields) &&
        fields.templateId === first.templateId &&
        fields.version === 2
      )
        throw new Error("History storage unavailable");
      return insert.call(this, fields, options);
    };
    const changed = declaration(slug, { content: contentWith("Committed v2") });
    try {
      const error = await DeclareTemplate(changed).catch(
        (reason: Error) => reason,
      );
      expect(error).to.be.instanceOf(Error);
      const api = await client();
      expect(await versionsOf(api, first.templateId)).to.deep.equal([2, 1]);
      const version = await GetModel(
        TemplateVersionModel,
        DEFAULT_TENANT_ID,
      ).getVersion(first.templateId, 2);
      expect(JSON.parse(version!.json_content).locales.en.subject).to.equal(
        "Committed v2",
      );
    } finally {
      TemplateVersionModel.prototype.insert = insert;
    }
    expect(await DeclareTemplate(changed)).to.include({
      outcome: "unchanged",
      version: 2,
    });
    const rows = await GetModel(TemplateVersionModel, DEFAULT_TENANT_ID).getBy(
      "templateId",
      first.templateId,
    );
    expect(rows.map((row) => row.version).sort((a, b) => a - b)).to.deep.equal([
      1, 2,
    ]);
    expect(
      await DeclareTemplate(
        declaration(slug, { content: contentWith("Next v3") }),
      ),
    ).to.include({ outcome: "updated", version: 3 });
    expect(await versionsOf(await client(), first.templateId)).to.deep.equal([
      3, 2, 1,
    ]);
  });

  it("keeps a template a user edited since it was declared", async () => {
    const { DeclareTemplate } = await mailing();
    const slug = `declared-kept-${stamp}`;
    const created = await DeclareTemplate(declaration(slug));
    const api = await client();
    const saved = await api.post(`${TEMPLATES}/${created.templateId}/content`, {
      content: contentWith("Edited by hand"),
    });
    expect(saved.status, JSON.stringify(saved.data)).to.equal(HTTP_OK);

    const pendingDraft = await DeclareTemplate(
      declaration(slug, { content: contentWith("Code wants this") }),
    );
    expect(pendingDraft.outcome).to.equal("kept");

    await api.post(`${TEMPLATES}/${created.templateId}/publish`, {});
    const published = await DeclareTemplate(
      declaration(slug, { content: contentWith("Code wants this") }),
    );
    expect(published).to.include({ outcome: "kept", version: 2 });
    const content = await api.get(`${TEMPLATES}/${created.templateId}/content`);
    expect(content.data.publishedContent.locales.en.subject).to.equal(
      "Edited by hand",
    );

    const original = await DeclareTemplate(declaration(slug));
    expect(original.outcome, "the declaration last applied").to.equal(
      "unchanged",
    );
  });

  it("keeps a template archived since it was declared", async () => {
    const { DeclareTemplate } = await mailing();
    const slug = `declared-archived-${stamp}`;
    const created = await DeclareTemplate(declaration(slug));
    const api = await client();
    await api.post(`${TEMPLATES}/${created.templateId}/archive`, {});
    const result = await DeclareTemplate(declaration(slug, { name: "Again" }));
    expect(result.outcome).to.equal("kept");
  });

  it("never takes over a template made in the dashboard", async () => {
    const { DeclareTemplate } = await mailing();
    const slug = `declared-dashboard-${stamp}`;
    const api = await client();
    const made = await api.post(`${TABLE}/new`, {
      slug,
      name: "Mine",
      category: "orders",
    });
    expect(made.status, JSON.stringify(made.data)).to.equal(HTTP_OK);
    const result = await DeclareTemplate(declaration(slug));
    expect(result).to.include({ outcome: "kept", version: 0 });
  });

  it("refuses what the dashboard refuses, with the field at fault", async () => {
    const { DeclareTemplate } = await mailing();
    const refusals: [Partial<TemplateDeclaration>, string][] = [
      [{ slug: "Not A Slug" }, "invalid_template"],
      [{ category: "unknown-category" }, "unknown_category"],
      [{ content: contentWith("  ") }, "empty_subject"],
      [{ content: { locales: {} } }, "nothing_to_publish"],
    ];
    for (const [overrides, code] of refusals) {
      const error = await DeclareTemplate(
        declaration(`declared-refused-${stamp}`, overrides),
      ).then(
        () => undefined,
        (reason: unknown) => reason as { code?: string; message: string },
      );
      expect(error?.code, JSON.stringify(overrides)).to.equal(code);
    }
    const invalid = await DeclareTemplate(
      declaration(`declared-refused-${stamp}`, { slug: "Bad Slug" }),
    ).catch((reason: Error) => reason);
    expect((invalid as Error).message).to.match(/slug/);
  });

  it("isolates declarations and imports with identical keys in different tenants", async () => {
    const { DeclareTemplate, DeclareTemplateCategory, ImportSends } =
      await mailing();
    const { GetModel } =
      await import("@antelopejs/interface-database-decorators");
    const { TemplateModel, SendModel, SendEventModel } =
      await import("../../db");
    const { getSettings } = await import("../../services/settings");
    const slug = `tenant-shared-${stamp}`;
    const tenants = [`mailing-a-${stamp}`, `mailing-b-${stamp}`];
    const templateIds: string[] = [];
    const sendIds: string[] = [];
    for (const tenantId of tenants) {
      await DeclareTemplateCategory({
        tenantId,
        id: "custom",
        label: tenantId,
        icon: "i-ph-tag",
      });
      const template = await DeclareTemplate(
        declaration(slug, {
          tenantId,
          category: "custom",
          content: contentWith(tenantId),
        }),
      );
      templateIds.push(template.templateId);
      const imported = await ImportSends({
        tenantId,
        sends: [
          {
            importId: "same-provider-key",
            templateSlug: slug,
            to: RECIPIENT,
            sentAt: new Date(),
          },
        ],
      });
      sendIds.push(imported.sendIds[0]!);
    }
    expect(new Set(templateIds).size).to.equal(2);
    expect(new Set(sendIds).size).to.equal(2);
    for (const [index, tenantId] of tenants.entries()) {
      const other = 1 - index;
      const templates = GetModel(TemplateModel, tenantId);
      expect(await templates.get(templateIds[other]!)).to.equal(undefined);
      expect(
        JSON.parse((await templates.getBySlug(slug))!.json_content).locales.en
          .subject,
      ).to.equal(tenantId);
      expect(
        (await getSettings(tenantId)).categories.find(
          (category) => category.id === "custom",
        )?.label,
      ).to.equal(tenantId);
      expect(await GetModel(SendModel, tenantId).get(sendIds[other]!)).to.equal(
        undefined,
      );
      expect(
        await GetModel(SendEventModel, tenantId).getBySend(sendIds[other]!),
      ).to.deep.equal([]);
      expect(
        (await GetModel(SendEventModel, tenantId).getBySend(sendIds[index]!))
          .length,
      ).to.equal(1);
    }
  });
});

/**
 * Categories live in the workspace settings, which the settings suite checks
 * against the defaults: these declarations go to a workspace of their own.
 */
describe("[integration] template category declarations", () => {
  const stamp = Date.now();
  const tenantId = `declarations-${stamp}`;

  async function storedCategories() {
    const { getSettings } = await import("../../services/settings");
    return (await getSettings(tenantId)).categories;
  }

  async function categoryIds(): Promise<string[]> {
    return (await storedCategories()).map((category) => category.id);
  }

  it("adds categories once, even declared together", async () => {
    const { DeclareTemplateCategory, DeclareTemplate } = await mailing();
    const ids = ["subscriptions", "events"];
    const results = await Promise.all(
      ids.map((id) =>
        DeclareTemplateCategory({
          tenantId,
          id,
          label: `Declared ${id}`,
          icon: "i-ph-tag",
        }),
      ),
    );
    expect(results.map((result) => result.outcome)).to.deep.equal([
      "created",
      "created",
    ]);
    expect(await categoryIds()).to.include.members(ids);
    const again = await DeclareTemplateCategory({
      tenantId,
      id: "subscriptions",
      label: "Declared subscriptions",
      icon: "i-ph-tag",
    });
    expect(again.outcome).to.equal("unchanged");

    const template = await DeclareTemplate(
      declaration("in-category", { tenantId, category: "subscriptions" }),
    );
    expect(template.outcome).to.equal("created");
  });

  it("relabels an untouched category and keeps a removed one away", async () => {
    const { DeclareTemplateCategory, DeclareTemplate } = await mailing();
    const id = "workshops";
    await DeclareTemplateCategory({
      tenantId,
      id,
      label: "Workshops",
      icon: "i-ph-tag",
    });
    const relabelled = await DeclareTemplateCategory({
      tenantId,
      id,
      label: "Trainings",
      icon: "i-ph-tag",
    });
    expect(relabelled.outcome).to.equal("updated");
    const labels = (await storedCategories()).map((category) => category.label);
    expect(labels).to.include("Trainings");

    const template = declaration("removed-category", {
      tenantId,
      category: id,
    });
    await DeclareTemplate(template);

    const { getSettings, saveSettings } =
      await import("../../services/settings");
    const settings = await getSettings(tenantId);
    await saveSettings(tenantId, {
      ...settings,
      categories: settings.categories.filter((category) => category.id !== id),
    });
    const redeclared = await DeclareTemplateCategory({
      tenantId,
      id,
      label: "Workshops again",
      icon: "i-ph-tag",
    });
    expect(redeclared.outcome).to.equal("kept");
    expect(await categoryIds()).to.not.include(id);
    expect((await DeclareTemplate(template)).outcome).to.equal("unchanged");

    const { GetModel } =
      await import("@antelopejs/interface-database-decorators");
    const { TemplateModel } = await import("../../db");
    const model = GetModel(TemplateModel, tenantId);
    const stored = await model.getBySlug(template.slug);
    await model.update(stored!._id, { category: "orders" });
    expect(
      (await DeclareTemplate({ ...template, name: "Code changed" })).outcome,
    ).to.equal("kept");
  });

  it("leaves a default category as the workspace has it", async () => {
    const { DeclareTemplateCategory } = await mailing();
    const result = await DeclareTemplateCategory({
      tenantId,
      id: "billing",
      label: "Invoices",
      icon: "i-ph-receipt",
    });
    expect(result.outcome).to.equal("kept");
  });

  it("refuses a label another category already has", async () => {
    const { DeclareTemplateCategory } = await mailing();
    const error = await DeclareTemplateCategory({
      tenantId,
      id: "invoices",
      label: "Billing",
      icon: "i-ph-receipt",
    }).catch((reason: { code?: string }) => reason);
    expect((error as { code?: string }).code).to.equal("invalid_category");
  });
});
