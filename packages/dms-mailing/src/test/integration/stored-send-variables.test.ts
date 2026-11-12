import { expect } from "chai";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";
import { checkedText } from "../helpers/checked";

const HTTP_OK = 200;
const HTTP_SERVER_ERROR = 500;
const TABLE = "/api/mailing/tables/templates";

async function sentTestEmail(slug: string) {
  const session = await ensureOwnerSession();
  const client = authorizedClient(session.accessToken);
  const created = await client.post(`${TABLE}/new`, {
    slug,
    name: slug,
    category: "orders",
  });
  expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
  const sent = await client.post(
    `/api/mailing/templates/${checkedText.parse(created.data._id)}/test-send`,
    { to: ["stored@example.test"], locale: "en", data: { order: { id: 7 } } },
  );
  expect(sent.status, JSON.stringify(sent.data)).to.equal(HTTP_OK);
  return { client, sendId: checkedText.parse(sent.data.results[0].sendId) };
}

async function storeVariables(sendId: string, json_variables: string) {
  const { GetModel } =
    await import("@antelopejs/interface-database-decorators");
  const { DEFAULT_TENANT_ID } =
    await import("@antelopejs/interface-dms/constants");
  const { SendModel } = await import("../../db");
  await GetModel(SendModel, DEFAULT_TENANT_ID).update(sendId, {
    json_variables,
  });
}

describe("[integration] a send's stored variables", () => {
  it("renders the sent e-mail with the variables it stored", async () => {
    const { client, sendId } = await sentTestEmail("stored-variables-kept");
    const html = await client.get(`/api/mailing/sends/${sendId}/html`);
    expect(html.status, JSON.stringify(html.data)).to.equal(HTTP_OK);
  });

  it("refuses a send whose stored variables are not a JSON object", async () => {
    const { client, sendId } = await sentTestEmail("stored-variables-wrong");
    await storeVariables(sendId, '"order 7"');
    const html = await client.get(`/api/mailing/sends/${sendId}/html`);
    expect(html.status).to.equal(HTTP_SERVER_ERROR);
  });
});
