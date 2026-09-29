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

const CONCURRENT_READERS = 5;
const LEGACY_RETENTION_DAYS = 45;
const LEGACY_SECRET = "l".repeat(48);

async function loadSettingsModules() {
  const { GetModel } =
    await import("@antelopejs/interface-database-decorators");
  const { SettingsModel } = await import("../../db");
  const settings = await import("../../services/settings");
  return {
    ...settings,
    rowsOf: (tenantId: string) => GetModel(SettingsModel, tenantId).getAll(),
    insertLegacyRow: (tenantId: string) =>
      GetModel(SettingsModel, tenantId).insert({
        fallbackLocale: "en",
        logRetentionDays: LEGACY_RETENTION_DAYS,
        blockOnMissingVariables: false,
        senderName: "",
        senderEmail: "",
        replyTo: "",
        json_categories: "[]",
        webhookSecret: LEGACY_SECRET,
      }),
  };
}

describe("[integration] settings row per tenant", () => {
  // Every request path reads the settings, so a tenant's first reads arrive
  // together. Each used to insert its own default row with its own webhook
  // secret; the row is now keyed by the tenant id so only one can land.
  it("creates a single row when first readers race", async () => {
    const { getSettings, rowsOf } = await loadSettingsModules();
    const tenantId = `settings-race-${Date.now()}`;

    const reads = await Promise.all(
      Array.from({ length: CONCURRENT_READERS }, () => getSettings(tenantId)),
    );

    const rows = await rowsOf(tenantId);
    expect(rows).to.have.lengthOf(1);
    expect(rows[0]?._id).to.equal(tenantId);
    for (const read of reads) {
      expect(read.webhookSecret).to.equal(rows[0]?.webhookSecret);
    }
  });

  it("keeps reading and updating a row written before the key existed", async () => {
    const { getSettings, saveSettings, rowsOf, insertLegacyRow } =
      await loadSettingsModules();
    const tenantId = `settings-legacy-${Date.now()}`;
    await insertLegacyRow(tenantId);

    const read = await getSettings(tenantId);
    expect(read.webhookSecret).to.equal(LEGACY_SECRET);
    await saveSettings(tenantId, {
      ...read,
      logRetentionDays: UPDATED_RETENTION_DAYS,
    });

    const rows = await rowsOf(tenantId);
    expect(rows).to.have.lengthOf(1);
    expect(rows[0]?.logRetentionDays).to.equal(UPDATED_RETENTION_DAYS);
  });

  it("saves a tenant's first settings under the tenant id", async () => {
    const { getSettings, saveSettings, rowsOf } = await loadSettingsModules();
    const tenantId = `settings-first-save-${Date.now()}`;
    const values = await getSettings(`settings-template-${Date.now()}`);

    await saveSettings(tenantId, { ...values, webhookSecret: LEGACY_SECRET });

    const rows = await rowsOf(tenantId);
    expect(rows).to.have.lengthOf(1);
    expect(rows[0]?._id).to.equal(tenantId);
    expect(rows[0]?.webhookSecret).to.equal(LEGACY_SECRET);
  });
});
