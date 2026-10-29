import { expect } from "chai";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
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
    tenantId: DEFAULT_TENANT_ID,
    slug,
    name: { en: `Declared ${slug}` },
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
  const { TemplateModel } = await import("../../db");
  const rows = await GetModel(TemplateModel, DEFAULT_TENANT_ID).getBy(
    "slug",
    slug,
  );
  return rows.length;
}

describe("[integration] template declarations", () => {
  const stamp = Date.now();

  it("rejects absent or blank tenants on all new APIs before writing", async () => {
    const { DeclareTemplate, DeclareTemplateCategory, ImportSends } =
      await mailing();
    const { GetModel } =
      await import("@antelopejs/interface-database-decorators");
    const { SettingsModel, SendModel, SendEventModel } =
      await import("../../db");
    const settings = GetModel(SettingsModel, DEFAULT_TENANT_ID);
    const before = JSON.stringify(await settings.get(DEFAULT_TENANT_ID));
    const events = GetModel(SendEventModel, DEFAULT_TENANT_ID);
    const eventCount = await events.table.count().run();
    const slug = `invalid-tenant-${stamp}`;
    const { tenantId: _tenantId, ...withoutTenant } = declaration(slug);
    const category = {
      id: `invalid-${stamp}`,
      label: { en: "Invalid tenant" },
      icon: "i-ph-tag",
    };
    const sends = [
      {
        importId: `invalid-${stamp}`,
        templateSlug: slug,
        to: RECIPIENT,
        sentAt: new Date(),
      },
    ];
    /**
     * These calls are both compile-time contract checks and JavaScript boundary
     * tests.
     */
    const calls = [
      // @ts-expect-error tenantId is required
      () => DeclareTemplate(withoutTenant),
      // @ts-expect-error tenantId is required
      () => DeclareTemplateCategory(category),
      // @ts-expect-error tenantId is required
      () => ImportSends({ sends }),
    ];
    for (const tenantId of ["", " \t\n "]) {
      calls.push(
        () => DeclareTemplate({ ...withoutTenant, tenantId }),
        () => DeclareTemplateCategory({ ...category, tenantId }),
        () => ImportSends({ sends, tenantId }),
      );
    }
    const codes = ["invalid_template", "invalid_category", "invalid_import"];
    for (const [index, call] of calls.entries()) {
      let error: unknown;
      try {
        await call();
      } catch (reason) {
        error = reason;
      }
      expect(error).to.include({ code: codes[index % codes.length] });
      expect(error).to.have.property("message").that.includes("tenantId");
    }
    expect(await rowsWithSlug(slug)).to.equal(0);
    expect(JSON.stringify(await settings.get(DEFAULT_TENANT_ID))).to.equal(
      before,
    );
    expect(
      await GetModel(SendModel, DEFAULT_TENANT_ID).listForTemplate(
        slug,
        new Date(0),
      ),
    ).to.deep.equal([]);
    expect(await events.table.count().run()).to.equal(eventCount);
    expect(
      await DeclareTemplateCategory({
        ...category,
        id: "orders",
        tenantId: DEFAULT_TENANT_ID,
      }),
    ).to.include({ outcome: "kept" });
    await DeclareTemplate({ ...withoutTenant, tenantId: DEFAULT_TENANT_ID });
    const imported = await ImportSends({ sends, tenantId: DEFAULT_TENANT_ID });
    expect(imported.imported).to.equal(1);
    expect(
      await GetModel(SendModel, DEFAULT_TENANT_ID).get(imported.sendIds[0]!),
    ).not.to.equal(undefined);
    expect(
      (
        await GetModel(SendEventModel, DEFAULT_TENANT_ID).getBySend(
          imported.sendIds[0]!,
        )
      ).length,
    ).to.equal(1);
  });

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
      "kept",
      "kept",
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

  it("reads a declared name in the reader's language and searches it", async () => {
    const { DeclareTemplate } = await mailing();
    const slug = `declared-localized-${stamp}`;
    const declared = await DeclareTemplate(
      declaration(slug, {
        name: { en: `Welcome ${stamp}`, fr: `Bienvenue ${stamp}` },
      }),
    );
    const api = await client();
    const inLocale = (locale: string) => ({
      headers: { "x-content-language": locale },
    });
    const path = `${TEMPLATES}/${declared.templateId}/content`;
    const [en, fr, de] = await Promise.all(
      ["en", "fr", "de"].map((locale) => api.get(path, inLocale(locale))),
    );
    expect(en?.data.template.name).to.equal(`Welcome ${stamp}`);
    expect(fr?.data.template.name).to.equal(`Bienvenue ${stamp}`);
    expect(de?.data.template.name, "falls back to en").to.equal(
      `Welcome ${stamp}`,
    );

    const search = async (text: string, locale: string) => {
      const list = await api.get(
        `${TABLE}/list?limit=20&search=${encodeURIComponent(text)}`,
        inLocale(locale),
      );
      expect(list.status, JSON.stringify(list.data)).to.equal(HTTP_OK);
      return (list.data.results as { _id: string; name: string }[])
        .filter((row) => row._id === declared.templateId)
        .map((row) => row.name);
    };
    expect(await search(`Bienvenue ${stamp}`, "fr")).to.deep.equal([
      `Bienvenue ${stamp}`,
    ]);
    expect(await search(`Bienvenue ${stamp}`, "en")).to.deep.equal([]);
    expect(await search(`Welcome ${stamp}`, "en")).to.deep.equal([
      `Welcome ${stamp}`,
    ]);
  });

  it("previews a declared template the way a gallery card asks", async () => {
    const { DeclareTemplate } = await mailing();
    const declared = await DeclareTemplate(
      declaration(`declared-thumbnail-${stamp}`),
    );
    const api = await client();
    /** The card of a live template: its published version, no locale. */
    const preview = await api.post(
      `${TEMPLATES}/${declared.templateId}/preview`,
      { version: "published" },
    );
    expect(preview.status, JSON.stringify(preview.data)).to.equal(HTTP_OK);
    expect(preview.data).to.include({
      locale: "en",
      subject: "Your order is ready",
    });
    expect(preview.data.html).to.include("Hello Sofie");
  });

  it("creates declarations racing on a fresh slug only once", async () => {
    const { DeclareTemplate } = await mailing();
    const slug = `declared-race-${stamp}`;
    const results = await Promise.all(
      Array.from({ length: 4 }, () => DeclareTemplate(declaration(slug))),
    );
    const outcomes = results.map((result) => result.outcome).sort();
    expect(outcomes).to.deep.equal(["created", "kept", "kept", "kept"]);
    expect(results.map((result) => result.version)).to.deep.equal([1, 1, 1, 1]);
    expect(await rowsWithSlug(slug)).to.equal(1);
  });

  /**
   * Written once: from its creation on, the template is the tenant's, and a
   * later declaration of the same slug, changed or not, writes nothing.
   */
  it("leaves a template a user edited as it is, whatever the code declares", async () => {
    const { DeclareTemplate } = await mailing();
    const slug = `declared-kept-${stamp}`;
    const created = await DeclareTemplate(declaration(slug));
    const api = await client();
    const saved = await api.post(`${TEMPLATES}/${created.templateId}/content`, {
      content: contentWith("Edited by hand"),
    });
    expect(saved.status, JSON.stringify(saved.data)).to.equal(HTTP_OK);
    await api.post(`${TEMPLATES}/${created.templateId}/publish`, {});

    const redeclared = await DeclareTemplate(
      declaration(slug, {
        name: { en: "Code wants this name" },
        content: contentWith("Code wants this"),
      }),
    );

    expect(redeclared).to.include({ outcome: "kept", version: 2 });
    const content = await api.get(`${TEMPLATES}/${created.templateId}/content`);
    expect(content.data.template.name).to.equal(`Declared ${slug}`);
    expect(content.data.publishedContent.locales.en.subject).to.equal(
      "Edited by hand",
    );
    expect(await versionsOf(api, created.templateId)).to.deep.equal([2, 1]);
  });

  it("keeps a template archived since it was declared", async () => {
    const { DeclareTemplate } = await mailing();
    const slug = `declared-archived-${stamp}`;
    const created = await DeclareTemplate(declaration(slug));
    const api = await client();
    await api.post(`${TEMPLATES}/${created.templateId}/archive`, {});
    const result = await DeclareTemplate(
      declaration(slug, { name: { en: "Again" } }),
    );
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
        (reason: unknown) => reason,
      );
      expect(error, JSON.stringify(overrides)).to.have.property("code", code);
    }
    const invalid = await DeclareTemplate(
      declaration(`declared-refused-${stamp}`, { slug: "Bad Slug" }),
    ).catch((reason: Error) => reason);
    expect(invalid).to.have.property("message").that.matches(/slug/);
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
        label: { en: tenantId },
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
      ).to.deep.equal({ en: tenantId });
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
          label: { en: `Declared ${id}` },
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
      label: { en: "Declared subscriptions" },
      icon: "i-ph-tag",
    });
    expect(again.outcome).to.equal("kept");

    const template = await DeclareTemplate(
      declaration("in-category", { tenantId, category: "subscriptions" }),
    );
    expect(template.outcome).to.equal("created");
  });

  it("never relabels a category the workspace already has", async () => {
    const { DeclareTemplateCategory } = await mailing();
    const id = "workshops";
    const declare = (en: string) =>
      DeclareTemplateCategory({
        tenantId,
        id,
        label: { en },
        icon: "i-ph-tag",
      });
    expect((await declare("Workshops")).outcome).to.equal("created");

    expect((await declare("Trainings")).outcome).to.equal("kept");
    const labels = (await storedCategories()).map((category) => category.label);
    expect(labels).to.deep.include({ en: "Workshops" });
    expect(labels).to.not.deep.include({ en: "Trainings" });
  });

  it("leaves a default category as the workspace has it", async () => {
    const { DeclareTemplateCategory } = await mailing();
    const result = await DeclareTemplateCategory({
      tenantId,
      id: "billing",
      label: { en: "Invoices" },
      icon: "i-ph-receipt",
    });
    expect(result.outcome).to.equal("kept");
  });

  it("refuses a label another category already has", async () => {
    const { DeclareTemplateCategory } = await mailing();
    const error = await DeclareTemplateCategory({
      tenantId,
      id: "invoices",
      label: { en: "Billing" },
      icon: "i-ph-receipt",
    }).catch((reason: { code?: string }) => reason);
    expect(error).to.have.property("code", "invalid_category");
  });
});

/** The sender lives in the workspace settings too: a workspace of its own. */
describe("[integration] sender declarations", () => {
  const stamp = Date.now();
  const tenantId = `sender-${stamp}`;
  const sender = {
    tenantId,
    name: "Acme",
    email: "hello@acme.example",
    replyTo: "support@acme.example",
  };

  async function storedSender() {
    const { getSettings } = await import("../../services/settings");
    const { senderName, senderEmail, replyTo } = await getSettings(tenantId);
    return { senderName, senderEmail, replyTo };
  }

  it("writes the sender of the workspace", async () => {
    const { DeclareSender } = await mailing();
    expect(await DeclareSender(sender)).to.equal(undefined);
    expect(await storedSender()).to.deep.equal({
      senderName: "Acme",
      senderEmail: "hello@acme.example",
      replyTo: "support@acme.example",
    });
  });

  it("replaces the stored sender and leaves the other settings", async () => {
    const { DeclareSender } = await mailing();
    const { getSettings } = await import("../../services/settings");
    const before = await getSettings(tenantId);
    await DeclareSender({ tenantId, email: "noreply@acme.example" });
    expect(await storedSender()).to.deep.equal({
      senderName: "",
      senderEmail: "noreply@acme.example",
      replyTo: "",
    });
    const after = await getSettings(tenantId);
    expect({
      ...after,
      senderName: before.senderName,
      senderEmail: before.senderEmail,
      replyTo: before.replyTo,
    }).to.deep.equal(before);
  });

  it("refuses a missing address or tenant, naming the field", async () => {
    const { DeclareSender } = await mailing();
    const refusals = [
      { ...sender, email: "" },
      { ...sender, email: "not an address" },
      { ...sender, tenantId: " " },
    ];
    for (const [index, input] of refusals.entries()) {
      const error = await DeclareSender(input).catch(
        (reason: { code?: string; message: string }) => reason,
      );
      expect(error).to.include({ code: "invalid_sender" });
      expect(error)
        .to.have.property("message")
        .that.includes(index < 2 ? "email" : "tenantId");
    }
  });
});
