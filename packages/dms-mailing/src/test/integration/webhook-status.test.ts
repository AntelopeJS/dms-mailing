import { expect } from "chai";
import { authorizedClient, eventsPath } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const SETTINGS = "/api/mailing/settings";
const EVENTS = eventsPath("status-check");
const SECRET_HEADER = "x-mailing-webhook-secret";

type Client = ReturnType<typeof authorizedClient>;

async function client(): Promise<Client> {
  const session = await ensureOwnerSession();
  return authorizedClient(session.accessToken);
}

async function secretOf(api: Client): Promise<string> {
  return (await api.get(SETTINGS)).data.webhookSecret as string;
}

describe("[integration] webhook status", () => {
  it("answers a refused secret in words and remembers why", async () => {
    const api = await client();
    const missing = await api.post(EVENTS, { messageId: "x", type: "opened" });
    expect(missing.status).to.equal(HTTP_FORBIDDEN);
    expect(missing.data).to.deep.include({
      error: "webhook_refused",
      reason: "missing_secret",
    });
    expect(missing.data.message).to.contain(SECRET_HEADER);

    const wrong = await api.post(
      EVENTS,
      { messageId: "x", type: "opened" },
      { headers: { [SECRET_HEADER]: "not-the-secret" } },
    );
    expect(wrong.status).to.equal(HTTP_FORBIDDEN);
    expect(wrong.data.reason).to.equal("bad_secret");

    const status = await api.get(`${SETTINGS}/webhook-status`);
    expect(status.status, JSON.stringify(status.data)).to.equal(HTTP_OK);
    expect(status.data.lastRefused).to.deep.include({
      provider: "status-check",
      reason: "bad_secret",
    });
  });

  it("checks the secret before the body, then refuses a malformed event", async () => {
    const api = await client();
    const anonymous = await api.post(EVENTS, { nonsense: true });
    expect(anonymous.status).to.equal(HTTP_FORBIDDEN);

    const malformed = await api.post(
      EVENTS,
      { nonsense: true },
      { headers: { [SECRET_HEADER]: await secretOf(api) } },
    );
    expect(malformed.status).to.equal(HTTP_BAD_REQUEST);
    expect(malformed.data.reason).to.equal("invalid_event");
    const status = await api.get(`${SETTINGS}/webhook-status`);
    expect(status.data.lastRefused.reason).to.equal("invalid_event");
  });

  it("refuses a body that is not JSON as an invalid event, after the secret", async () => {
    const api = await client();
    const raw = (headers: Record<string, string>) =>
      api.post(EVENTS, "{x", {
        headers: { "content-type": "application/json", ...headers },
        transformRequest: [(data: unknown) => data],
      });
    const anonymous = await raw({});
    expect(anonymous.status).to.equal(HTTP_FORBIDDEN);
    expect(anonymous.data.reason).to.equal("missing_secret");

    const unparsable = await raw({ [SECRET_HEADER]: await secretOf(api) });
    expect(unparsable.status, JSON.stringify(unparsable.data)).to.equal(
      HTTP_BAD_REQUEST,
    );
    expect(unparsable.data).to.deep.include({
      error: "webhook_refused",
      reason: "invalid_event",
    });
    const status = await api.get(`${SETTINGS}/webhook-status`);
    expect(status.data.lastRefused).to.deep.include({
      provider: "status-check",
      reason: "invalid_event",
    });
  });

  it("remembers the last event it accepted, matched to a send or not", async () => {
    const api = await client();
    const accepted = await api.post(
      EVENTS,
      { messageId: "no-such-message", type: "delivered" },
      { headers: { [SECRET_HEADER]: await secretOf(api) } },
    );
    expect(accepted.status, JSON.stringify(accepted.data)).to.equal(HTTP_OK);
    expect(accepted.data.recorded).to.equal(false);
    const status = await api.get(`${SETTINGS}/webhook-status`);
    expect(status.data.lastReceived).to.deep.include({
      provider: "status-check",
      type: "delivered",
      isMatched: false,
      isTest: false,
    });
  });

  it("sends a test event to the webhook URL the settings show", async () => {
    const api = await client();
    const tested = await api.post(`${SETTINGS}/webhook-test`, {});
    expect(tested.status, JSON.stringify(tested.data)).to.equal(HTTP_OK);
    expect(tested.data).to.deep.include({ isReceived: true, httpStatus: 200 });
    expect(tested.data.url).to.contain("/api/mailing/events/");
    expect(tested.data.status.lastReceived).to.deep.include({
      isTest: true,
      isMatched: false,
    });
  });
});
