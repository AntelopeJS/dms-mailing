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
    const { DeclareTemplateCategory } = await mailing();
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
