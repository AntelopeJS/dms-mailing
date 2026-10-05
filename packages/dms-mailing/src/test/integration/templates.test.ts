import { expect } from "chai";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const TABLE = "/api/mailing/tables/templates";

interface TemplateRow {
  _id: string;
  slug: string;
  status: string;
  locales: string;
}

interface BlockRow {
  type: string;
}

describe("[integration] templates table", () => {
  it("creates a blank template with only a footer and lists it", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const created = await client.post(`${TABLE}/new`, {
      slug: "order-confirmed",
      name: "Order confirmed",
      category: "orders",
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);

    const list = await client.get(`${TABLE}/list`);
    expect(list.status).to.equal(HTTP_OK);
    const row = list.data.results.find(
      (item: TemplateRow) => item.slug === "order-confirmed",
    ) as TemplateRow;
    expect(row.status).to.equal("draft");
    expect(row.locales).to.equal("en");

    const content = await client.get(
      `/api/mailing/templates/${row._id}/content`,
    );
    expect(content.status).to.equal(HTTP_OK);
    expect(
      content.data.content.locales.en.blocks.map(
        (block: BlockRow) => block.type,
      ),
    ).to.deep.equal(["footer"]);
    expect(content.data.content.locales.en.subject).to.equal("");
    expect(content.data.variables).to.deep.equal([]);
  });

  it("creates from an existing template by copying its content", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const source = await client.post(`${TABLE}/new`, {
      slug: "copy-source",
      name: "Copy source",
      category: "orders",
    });
    const sourceId = source.data[0] as string;
    await client.post(`/api/mailing/templates/${sourceId}/content`, {
      content: {
        locales: {
          en: {
            subject: "Hello {{customer.firstName}}",
            preheader: "",
            blocks: [],
          },
        },
      },
    });
    await client.post(`/api/mailing/templates/${sourceId}/variables`, {
      variables: [
        { path: "customer.firstName", type: "string", required: true },
      ],
    });

    const copy = await client.post(`${TABLE}/new`, {
      slug: "copy-target",
      name: "Copy target",
      sourceTemplateId: sourceId,
    });
    expect(copy.status, JSON.stringify(copy.data)).to.equal(HTTP_OK);
    const content = await client.get(
      `/api/mailing/templates/${copy.data[0] as string}/content`,
    );
    expect(content.data.content.locales.en.subject).to.equal(
      "Hello {{customer.firstName}}",
    );
    expect(content.data.variables).to.deep.equal([
      { path: "customer.firstName", type: "string", required: true },
    ]);
  });

  it("keeps the slug when only the name and category are edited", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const created = await client.post(`${TABLE}/new`, {
      slug: "keeps-slug",
      name: "Keeps slug",
      category: "orders",
    });
    const id = created.data[0] as string;
    // The data-api `edit` route replaces the writable fields: a body missing
    // one nulls it. The editor must send the whole writable set.
    const edited = await client.put(`${TABLE}/edit?id=${id}`, {
      slug: "keeps-slug",
      name: "Renamed",
      category: "billing",
    });
    expect(edited.status, JSON.stringify(edited.data)).to.equal(HTTP_OK);
    const row = await client.get(`${TABLE}/get?id=${id}`);
    expect(row.data.slug).to.equal("keeps-slug");
    expect(row.data.name).to.equal("Renamed");
    expect(row.data.category).to.equal("billing");
  });

  // From interface-data-api 0.2.0 on, an absent key leaves the field unchanged:
  // the editor clears a category by sending `null`, which every version stores.
  it("clears the category when the edit sends null", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const created = await client.post(`${TABLE}/new`, {
      slug: "clears-category",
      name: "Clears category",
      category: "orders",
    });
    const id = created.data[0] as string;

    const edited = await client.put(`${TABLE}/edit?id=${id}`, {
      slug: "clears-category",
      name: "Clears category",
      category: null,
    });
    expect(edited.status, JSON.stringify(edited.data)).to.equal(HTTP_OK);
    const row = await client.get(`${TABLE}/get?id=${id}`);
    expect(row.data.slug).to.equal("clears-category");
    expect(row.data.category).to.equal(null);
  });

  // Sends resolve a template by slug and only the create paths check it is
  // free, so an edit must neither move it nor, by omitting it, clear it.
  it("refuses a slug change on edit and keeps the slug when it is omitted", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const created = await client.post(`${TABLE}/new`, {
      slug: "fixed-slug",
      name: "Fixed slug",
      category: "orders",
    });
    const id = created.data[0] as string;

    const moved = await client.put(`${TABLE}/edit?id=${id}`, {
      slug: "order-confirmed",
      name: "Fixed slug",
      category: "orders",
    });
    expect(moved.status).to.equal(HTTP_CONFLICT);
    expect(JSON.stringify(moved.data)).to.contain("slug_immutable");

    const omitted = await client.put(`${TABLE}/edit?id=${id}`, {
      name: "Renamed without slug",
      category: "orders",
    });
    expect(omitted.status, JSON.stringify(omitted.data)).to.equal(HTTP_OK);
    const row = await client.get(`${TABLE}/get?id=${id}`);
    expect(row.data.slug).to.equal("fixed-slug");
    expect(row.data.name).to.equal("Renamed without slug");

    const { GetModel } =
      await import("@antelopejs/interface-database-decorators");
    const { DEFAULT_TENANT_ID } =
      await import("@antelopejs/interface-dms/constants");
    const { TemplateModel } = await import("../../db");
    await GetModel(TemplateModel, DEFAULT_TENANT_ID).delete(id);
  });

  it("refuses an unknown source template", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const created = await client.post(`${TABLE}/new`, {
      slug: "copy-missing",
      name: "Copy missing",
      sourceTemplateId: "does-not-exist",
    });
    expect(created.status).to.equal(HTTP_NOT_FOUND);
    expect(JSON.stringify(created.data)).to.contain("template_not_found");
  });

  it("rejects a duplicate slug", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const dup = await client.post(`${TABLE}/new`, {
      slug: "order-confirmed",
      name: "Again",
      category: "orders",
    });
    expect(dup.status).to.be.at.least(HTTP_BAD_REQUEST);
  });
});

describe("[integration] template content and status", () => {
  async function createTemplate(
    client: ReturnType<typeof authorizedClient>,
    slug: string,
  ): Promise<string> {
    const created = await client.post(`${TABLE}/new`, {
      slug,
      name: slug,
      category: "orders",
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    return created.data[0] as string;
  }

  it("replaces the content, publishes and duplicates", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const id = await createTemplate(client, "welcome");
    const before = await client.get(`/api/mailing/templates/${id}/content`);
    const content = before.data.content;
    content.locales.en.subject = "Welcome {{customer.firstName}}";
    const saved = await client.post(`/api/mailing/templates/${id}/content`, {
      content,
    });
    expect(saved.status, JSON.stringify(saved.data)).to.equal(HTTP_OK);
    expect(saved.data.saved).to.equal(true);

    const publish = await client.post(
      `/api/mailing/templates/${id}/publish`,
      {},
    );
    expect(publish.status).to.equal(HTTP_OK);
    const after = await client.get(`/api/mailing/templates/${id}/content`);
    expect(after.data.template.status).to.equal("live");
    expect(after.data.content.locales.en.subject).to.equal(
      "Welcome {{customer.firstName}}",
    );

    const variables = await client.post(
      `/api/mailing/templates/${id}/variables`,
      {
        variables: [
          { path: "customer.firstName", type: "string", required: false },
        ],
      },
    );
    expect(variables.status).to.equal(HTTP_OK);
    const testData = await client.post(
      `/api/mailing/templates/${id}/test-data`,
      { data: { customer: { firstName: "Sofie" } } },
    );
    expect(testData.status).to.equal(HTTP_OK);

    const duplicate = await client.post(
      `/api/mailing/templates/${id}/duplicate`,
      { slug: "welcome-copy", name: "Welcome copy" },
    );
    expect(duplicate.status, JSON.stringify(duplicate.data)).to.equal(HTTP_OK);
    const copy = await client.get(
      `/api/mailing/templates/${duplicate.data.id}/content`,
    );
    expect(copy.data.template.status).to.equal("draft");
    expect(copy.data.content.locales.en.subject).to.equal(
      "Welcome {{customer.firstName}}",
    );
    expect(copy.data.variables).to.have.length(1);
  });

  it("previews the current content with test data and reports missing variables", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    // Looked up by slug rather than on the table's first page, which other
    // tests fill with their own templates.
    const { GetModel } =
      await import("@antelopejs/interface-database-decorators");
    const { DEFAULT_TENANT_ID } =
      await import("@antelopejs/interface-dms/constants");
    const { TemplateModel } = await import("../../db");
    const welcome = await GetModel(TemplateModel, DEFAULT_TENANT_ID).getBySlug(
      "welcome",
    );
    const id = welcome?._id as string;
    const preview = await client.post(`/api/mailing/templates/${id}/preview`, {
      locale: "en",
      data: {},
    });
    expect(preview.status, JSON.stringify(preview.data)).to.equal(HTTP_OK);
    expect(preview.data.html).to.include("<!DOCTYPE html>");
    expect(preview.data.missing).to.include("customer.firstName");
    expect(preview.data.subject).to.equal("Welcome {{customer.firstName}}");
  });
});
