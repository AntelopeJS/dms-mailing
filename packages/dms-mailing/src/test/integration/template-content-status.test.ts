import { expect } from "chai";
import { z } from "zod";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";
import { checkedText, parsedBody } from "../helpers/checked";

const HTTP_OK = 200;
const TABLE = "/api/mailing/tables/templates";

/** The content of a template as the editor sends it back, with the parts the test changes. */
const editableContentSchema = z.object({
  content: z
    .object({
      locales: z
        .object({ en: z.object({ subject: z.string() }).passthrough() })
        .passthrough(),
    })
    .passthrough(),
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
    return checkedText.parse(created.data._id);
  }

  it("replaces the content, publishes and duplicates", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const id = await createTemplate(client, "welcome");
    const before = await client.get(`/api/mailing/templates/${id}/content`);
    const { content } = parsedBody(before, editableContentSchema);
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
    const id = checkedText.parse(welcome?._id);
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
