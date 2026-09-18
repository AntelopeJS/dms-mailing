import { expect } from "chai";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const DEFAULT_CATEGORY_COUNT = 5;
const DEFAULT_RETENTION_DAYS = 90;
const UPDATED_RETENTION_DAYS = 30;
const INVALID_RETENTION_DAYS = 0;

describe("[integration] settings", () => {
  it("returns defaults, accepts an update and rejects an invalid retention", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const initial = await client.get("/api/mailing/settings");
    expect(initial.status).to.equal(HTTP_OK);
    expect(initial.data.fallbackLocale).to.equal("en");
    expect(initial.data.logRetentionDays).to.equal(DEFAULT_RETENTION_DAYS);
    expect(initial.data.categories).to.have.length(DEFAULT_CATEGORY_COUNT);

    const update = await client.post("/api/mailing/settings", {
      ...initial.data,
      fallbackLocale: "fr",
      logRetentionDays: UPDATED_RETENTION_DAYS,
      blockOnMissingVariables: true,
    });
    expect(update.status).to.equal(HTTP_OK);
    const after = await client.get("/api/mailing/settings");
    expect(after.data.fallbackLocale).to.equal("fr");
    expect(after.data.blockOnMissingVariables).to.equal(true);

    const invalid = await client.post("/api/mailing/settings", {
      ...after.data,
      logRetentionDays: INVALID_RETENTION_DAYS,
    });
    expect(invalid.status).to.equal(HTTP_BAD_REQUEST);

    // Blanking the secret would leave the unauthenticated event endpoint with
    // no gate, so the write has to be refused rather than silently accepted.
    const blankSecret = await client.post("/api/mailing/settings", {
      ...after.data,
      webhookSecret: "",
    });
    expect(blankSecret.status).to.equal(HTTP_BAD_REQUEST);

    const restored = await client.post("/api/mailing/settings", initial.data);
    expect(restored.status).to.equal(HTTP_OK);
  });
});
