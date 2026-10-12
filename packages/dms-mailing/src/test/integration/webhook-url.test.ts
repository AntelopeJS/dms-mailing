import { expect } from "chai";
import { getConfig, setConfig } from "../../config";
import { authorizedClient, createClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const SETTINGS = "/api/mailing/settings";
const EVENTS_PATH = "/api/mailing/events/";
const PUBLIC_API_URL = "https://hooks.example.test/";
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
  it("starts with the public API address the module is configured with", async () => {
    const previous = getConfig();
    setConfig({ ...previous, publicApiUrl: PUBLIC_API_URL });
    try {
      const settings = await readSettings();
      expect(settings.webhookUrl).to.match(
        /^https:\/\/hooks\.example\.test\/api\/mailing\/events\/[^/]+\/[^/]+$/,
      );
    } finally {
      setConfig(previous);
    }
  });

  it("names the tenant, which the event route then records against", async () => {
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

    // The tenant in the path wins over one the body names.
    const otherTenant = await anonymous.post(
      `${EVENTS_PATH}${provider}/${OTHER_TENANT}`,
      { ...EVENT, tenantId },
      { headers },
    );
    expect(otherTenant.status).to.equal(HTTP_FORBIDDEN);
  });
});
