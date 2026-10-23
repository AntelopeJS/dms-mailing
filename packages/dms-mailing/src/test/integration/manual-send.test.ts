import { expect } from "chai";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_UNPROCESSABLE = 422;
const TABLE = "/api/mailing/tables/templates";
const RECIPIENT = "julie@example.test";

/**
 * A real send typed by hand from the dialog never goes out with a required
 * value missing, whatever the workspace's `blockOnMissingVariables` says; tests
 * and API calls keep following that setting.
 */
describe("[integration] manual real sends", () => {
  it("refuses a manual real send that lacks a required variable", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const created = await client.post(`${TABLE}/new`, {
      slug: "manual-required",
      name: "Manual required",
      category: "orders",
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    const id = created.data._id as string;
    await client.post(`/api/mailing/templates/${id}/content`, {
      content: {
        locales: {
          en: { subject: "Hi {{user.firstName}}", preheader: "", blocks: [] },
        },
      },
    });
    await client.post(`/api/mailing/templates/${id}/variables`, {
      variables: [{ path: "user.firstName", type: "string", required: true }],
    });
    await client.post(`/api/mailing/templates/${id}/publish`, {});

    const refused = await client.post(`/api/mailing/templates/${id}/send`, {
      to: [RECIPIENT],
      locale: "en",
      data: {},
    });
    expect(refused.status).to.equal(HTTP_UNPROCESSABLE);
    expect(JSON.stringify(refused.data)).to.contain("missing_variables");

    const tested = await client.post(`/api/mailing/templates/${id}/test-send`, {
      to: [RECIPIENT],
      locale: "en",
      data: {},
    });
    expect(tested.status, JSON.stringify(tested.data)).to.equal(HTTP_OK);

    const sent = await client.post(`/api/mailing/templates/${id}/send`, {
      to: [RECIPIENT],
      locale: "en",
      data: { user: { firstName: "Julie" } },
    });
    expect(sent.status, JSON.stringify(sent.data)).to.equal(HTTP_OK);
  });
});
