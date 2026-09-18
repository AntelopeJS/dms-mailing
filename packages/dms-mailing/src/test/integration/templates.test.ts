import { expect } from "chai";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
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
    const list = await client.get(`${TABLE}/list`);
    const id = (
      list.data.results.find(
        (item: TemplateRow) => item.slug === "welcome",
      ) as TemplateRow
    )._id;
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
