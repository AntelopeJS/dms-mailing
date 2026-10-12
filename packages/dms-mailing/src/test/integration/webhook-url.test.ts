import { expect } from "chai";
import { authorizedClient, createClient, getBaseUrl } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const SETTINGS = "/api/mailing/settings";
const EVENTS_PATH = "/api/mailing/events/";
const SECRET_HEADER = "x-mailing-webhook-secret";
const OTHER_TENANT = "fix-l7-other-tenant";

const EVENT = {
  messageId: "fix-l7-unknown-message",
  type: "delivered",
};

async function readSettings() {
  const session = await ensureOwnerSession();
  const client = authorizedClient(session.accessToken);
  return (await client.get(SETTINGS)).data;
}

describe("[integration] webhook URL", () => {
  it("starts with the API base URL the DMS is configured with", async () => {
    const settings = await readSettings();
    expect(
      settings.webhookUrl.startsWith(`${getBaseUrl()}${EVENTS_PATH}`),
    ).to.equal(true);
  });

  it("ignores the forwarding headers of the request", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const headers = { "x-forwarded-host": "internal.example.test" };
    const settings = (await client.get(SETTINGS, { headers })).data;
    expect(settings.webhookUrl).not.to.contain("internal.example.test");
  });

  it("names the tenant, whose secret alone the event route accepts", async () => {
    const settings = await readSettings();
    const url = new URL(settings.webhookUrl);
    expect(url.pathname.startsWith(EVENTS_PATH)).to.equal(true);
    const [provider, tenantId] = url.pathname
      .slice(EVENTS_PATH.length)
      .split("/");
    expect(provider).to.be.a("string");
    expect(tenantId).to.be.a("string");

    const anonymous = createClient();
    const headers = { [SECRET_HEADER]: settings.webhookSecret };
    const accepted = await anonymous.post(url.pathname, EVENT, { headers });
    expect(accepted.status, JSON.stringify(accepted.data)).to.equal(HTTP_OK);

    const otherTenant = await anonymous.post(
      `${EVENTS_PATH}${provider}/${OTHER_TENANT}`,
      EVENT,
      { headers },
    );
    expect(otherTenant.status).to.equal(HTTP_FORBIDDEN);
  });

  it("answers no address without a tenant", async () => {
    const settings = await readSettings();
    const headers = { [SECRET_HEADER]: settings.webhookSecret };
    const posted = await createClient().post(`${EVENTS_PATH}manual`, EVENT, {
      headers,
    });
    expect(posted.status).to.equal(HTTP_NOT_FOUND);
  });
});
