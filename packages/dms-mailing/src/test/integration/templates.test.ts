import { expect } from "chai";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";
import { checkedText } from "../helpers/checked";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const TABLE = "/api/mailing/tables/templates";
const DETAILS = "/api/mailing/templates";

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

    const list = await client.get(`${TABLE}/list?limit=100`);
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
    const [footer] = content.data.content.locales.en.blocks;
    expect(footer.unsubscribeLabel, "transactional footer").to.equal("");
    expect(footer.preferencesLabel, "transactional footer").to.equal("");
    expect(content.data.content.locales.en.subject).to.equal("");
    expect(content.data.variables).to.deep.equal([]);
  });

  /**
   * interface-data-api 0.3 answers `new` with the row, not `["<id>"]`, and
   * refuses a body handed on as a JSON string.
   */
  it("answers the creation with the row of the seeded template", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const created = await client.post(`${TABLE}/new`, {
      slug: "answers-row",
      name: "Answers row",
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    expect(created.data).to.include({ slug: "answers-row" });
    expect(created.data._id).to.be.a("string");

    const content = await client.get(
      `/api/mailing/templates/${created.data._id}/content`,
    );
    expect(content.status).to.equal(HTTP_OK);
  });

  it("creates from an existing template by copying its content", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const source = await client.post(`${TABLE}/new`, {
      slug: "copy-source",
      name: "Copy source",
      category: "orders",
    });
    const sourceId = checkedText(source.data._id);
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
      `/api/mailing/templates/${checkedText(copy.data._id)}/content`,
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
    const id = checkedText(created.data._id);
    const edited = await client.put(`${DETAILS}/${id}/details`, {
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

  /**
   * From interface-data-api 0.2.0 on, an absent key leaves the field unchanged:
   * the editor clears a category by sending `null`, which every version stores.
   */
  it("clears the category when the edit sends null", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const created = await client.post(`${TABLE}/new`, {
      slug: "clears-category",
      name: "Clears category",
      category: "orders",
    });
    const id = checkedText(created.data._id);

    const edited = await client.put(`${DETAILS}/${id}/details`, {
      slug: "clears-category",
      name: "Clears category",
      category: null,
    });
    expect(edited.status, JSON.stringify(edited.data)).to.equal(HTTP_OK);
    const row = await client.get(`${TABLE}/get?id=${id}`);
    expect(row.data.slug).to.equal("clears-category");
    expect(row.data.category || null).to.equal(null);
  });

  /**
   * Sends resolve a template by slug and only the create paths check it is
   * free, so an edit must neither move it nor, by omitting it, clear it.
   */
  it("refuses a slug change on edit and keeps the slug when it is omitted", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const created = await client.post(`${TABLE}/new`, {
      slug: "fixed-slug",
      name: "Fixed slug",
      category: "orders",
    });
    const id = checkedText(created.data._id);

    const moved = await client.put(`${DETAILS}/${id}/details`, {
      slug: "order-confirmed",
      name: "Fixed slug",
      category: "orders",
    });
    expect(moved.status).to.equal(HTTP_CONFLICT);
    expect(JSON.stringify(moved.data)).to.contain("slug_immutable");

    const omitted = await client.put(`${DETAILS}/${id}/details`, {
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
    return checkedText(created.data._id);
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
    /**
     * Looked up by slug rather than on the table's first page, which other
     * tests fill with their own templates.
     */
    const { GetModel } =
      await import("@antelopejs/interface-database-decorators");
    const { DEFAULT_TENANT_ID } =
      await import("@antelopejs/interface-dms/constants");
    const { TemplateModel } = await import("../../db");
    const welcome = await GetModel(TemplateModel, DEFAULT_TENANT_ID).getBySlug(
      "welcome",
    );
    const id = checkedText(welcome?._id);
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

describe("[integration] templates table guards", () => {
  const HTTP_UNPROCESSABLE = 422;
  const RACERS = 3;

  type Client = ReturnType<typeof authorizedClient>;

  async function client(): Promise<Client> {
    const session = await ensureOwnerSession();
    return authorizedClient(session.accessToken);
  }

  async function models() {
    const { GetModel } =
      await import("@antelopejs/interface-database-decorators");
    const { DEFAULT_TENANT_ID } =
      await import("@antelopejs/interface-dms/constants");
    const { TemplateModel, TemplateVersionModel } = await import("../../db");
    return {
      templates: GetModel(TemplateModel, DEFAULT_TENANT_ID),
      versions: GetModel(TemplateVersionModel, DEFAULT_TENANT_ID),
    };
  }

  async function create(api: Client, slug: string): Promise<string> {
    const created = await api.post(`${TABLE}/new`, {
      slug,
      name: slug,
      category: "orders",
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    return checkedText(created.data._id);
  }

  async function publish(api: Client, id: string): Promise<void> {
    await api.post(`${DETAILS}/${id}/content`, {
      content: {
        locales: { en: { subject: "Published", preheader: "", blocks: [] } },
      },
    });
    const published = await api.post(`${DETAILS}/${id}/publish`, {});
    expect(published.status, JSON.stringify(published.data)).to.equal(HTTP_OK);
  }

  const remove = (api: Client, id: string) =>
    api.delete(`${TABLE}/delete?id=${id}`);

  async function hasSends(
    api: Client,
    slug: string,
    id: string,
  ): Promise<boolean | undefined> {
    const list = await api.get(`${TABLE}/list?limit=20&search=${slug}`);
    expect(list.status, JSON.stringify(list.data)).to.equal(HTTP_OK);
    const rows = list.data.results as { _id: string; hasSends?: boolean }[];
    return rows.find((row) => row._id === id)?.hasSends;
  }

  it("refuses to delete a live template, and a sent archived one", async () => {
    const api = await client();
    const id = await create(api, "fix-l2-delete-live");
    await publish(api, id);

    const live = await remove(api, id);
    expect(live.status).to.equal(HTTP_CONFLICT);
    expect(JSON.stringify(live.data)).to.contain("template_in_use");

    const sent = await api.post(`${DETAILS}/${id}/test-send`, {
      to: ["sofie@example.test"],
      locale: "en",
    });
    expect(sent.status, JSON.stringify(sent.data)).to.equal(HTTP_OK);
    await api.post(`${DETAILS}/${id}/archive`, {});
    const archived = await remove(api, id);
    expect(archived.status).to.equal(HTTP_CONFLICT);
    expect(JSON.stringify(archived.data)).to.contain("template_was_sent");
    expect(await hasSends(api, "fix-l2-delete-live", id)).to.equal(true);
    const { templates } = await models();
    expect(await templates.get(id)).to.not.equal(undefined);
  });

  it("deletes an archived template never sent, with its versions", async () => {
    const api = await client();
    const id = await create(api, "fix-l2-delete-archived");
    await publish(api, id);
    const archive = await api.post(`${DETAILS}/${id}/archive`, {});
    expect(archive.status, JSON.stringify(archive.data)).to.equal(HTTP_OK);
    const { templates, versions } = await models();
    expect(await versions.listForTemplate(id)).to.have.length.greaterThan(0);

    expect(await hasSends(api, "fix-l2-delete-archived", id)).to.equal(false);

    const deleted = await remove(api, id);
    expect(deleted.status, JSON.stringify(deleted.data)).to.equal(HTTP_OK);
    expect(await templates.get(id)).to.equal(undefined);
    expect(await versions.listForTemplate(id)).to.deep.equal([]);
  });

  it("keeps a single template when creations of one slug race", async () => {
    const api = await client();
    const responses = await Promise.all(
      Array.from({ length: RACERS }, () =>
        api.post(`${TABLE}/new`, {
          slug: "fix-l2-race",
          name: "Race",
          category: "orders",
        }),
      ),
    );
    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === HTTP_OK)).to.have.length(1);
    expect(
      statuses.filter((status) => status === HTTP_CONFLICT),
    ).to.have.length(RACERS - 1);
    const { templates } = await models();
    expect(await templates.getBy("slug", "fix-l2-race")).to.have.length(1);
  });

  it("stores the slug and the name trimmed", async () => {
    const api = await client();
    const created = await api.post(`${TABLE}/new`, {
      slug: "  fix-l2-trim ",
      name: "  Trimmed  ",
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    const row = await api.get(
      `${TABLE}/get?id=${checkedText(created.data._id)}`,
    );
    expect(row.data.slug).to.equal("fix-l2-trim");
    expect(row.data.name).to.equal("Trimmed");

    const again = await api.post(`${TABLE}/new`, {
      slug: "fix-l2-trim",
      name: "Again",
    });
    expect(again.status).to.equal(HTTP_CONFLICT);
  });

  it("answers an invalid slug or name with a 400, not a stack", async () => {
    const api = await client();
    const upper = await api.post(`${TABLE}/new`, {
      slug: "FIX-L2-UPPER",
      name: "Upper",
    });
    expect(upper.status).to.equal(HTTP_BAD_REQUEST);
    expect(JSON.stringify(upper.data)).to.contain("invalid_template");
    const nameless = await api.post(`${TABLE}/new`, {
      slug: "fix-l2-nameless",
    });
    expect(nameless.status).to.equal(HTTP_BAD_REQUEST);
  });

  it("refuses an unknown category and an emptied name", async () => {
    const api = await client();
    const unknown = await api.post(`${TABLE}/new`, {
      slug: "fix-l2-unknown-category",
      name: "Unknown category",
      category: "nope",
    });
    expect(unknown.status).to.equal(HTTP_UNPROCESSABLE);
    expect(JSON.stringify(unknown.data)).to.contain("unknown_category");

    const id = await create(api, "fix-l2-edit-guards");
    const category = await api.put(`${DETAILS}/${id}/details`, {
      name: "Edit guards",
      category: "nope",
    });
    expect(category.status).to.equal(HTTP_UNPROCESSABLE);
    const blank = await api.put(`${DETAILS}/${id}/details`, {
      name: "   ",
      category: "orders",
    });
    expect(blank.status).to.be.at.least(HTTP_BAD_REQUEST);
    /** The DMS edit form writes every language at once. */
    const all = { headers: { "x-content-language": "*" } };
    const blankEverywhere = await api.put(
      `${TABLE}/edit?id=${id}`,
      { name: { en: " ", fr: "" }, category: "orders" },
      all,
    );
    expect(blankEverywhere.status).to.be.at.least(HTTP_BAD_REQUEST);
    const row = await api.get(`${TABLE}/get?id=${id}`);
    expect(row.data.name).to.equal("fix-l2-edit-guards");
  });

  it("renames in the reader's language and keeps the others", async () => {
    const api = await client();
    const id = await create(api, "localized-rename");
    const inFrench = { headers: { "x-content-language": "fr" } };
    const renamed = await api.put(
      `${DETAILS}/${id}/details`,
      { name: "Renommé", category: "orders" },
      inFrench,
    );
    expect(renamed.status, JSON.stringify(renamed.data)).to.equal(HTTP_OK);
    const fr = await api.get(`${TABLE}/get?id=${id}`, inFrench);
    const en = await api.get(`${TABLE}/get?id=${id}`);
    expect(fr.data.name).to.equal("Renommé");
    expect(en.data.name).to.equal("localized-rename");

    /** The DMS edit form reads and writes every language at once. */
    const all = { headers: { "x-content-language": "*" } };
    const record = await api.get(`${TABLE}/get?id=${id}`, all);
    expect(record.data.name).to.deep.equal({
      en: "localized-rename",
      fr: "Renommé",
    });
    const edited = await api.put(
      `${TABLE}/edit?id=${id}`,
      { name: { en: "Renamed", fr: "Renommé" }, category: "billing" },
      all,
    );
    expect(edited.status, JSON.stringify(edited.data)).to.equal(HTTP_OK);
    expect((await api.get(`${TABLE}/get?id=${id}`)).data.name).to.equal(
      "Renamed",
    );
  });
});
