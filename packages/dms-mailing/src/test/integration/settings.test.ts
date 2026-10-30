import { expect } from "chai";
import type { AxiosInstance } from "axios";
import { z } from "zod";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";
import { checkedText } from "../helpers/checked";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const SETTINGS = "/api/mailing/settings";
const TEMPLATES_TABLE = "/api/mailing/tables/templates";
const JSON_HEADERS = { "content-type": "application/json" };
const DEFAULT_CATEGORY_COUNT = 5;
const DEFAULT_RETENTION_DAYS = 90;
const UPDATED_RETENTION_DAYS = 30;
const INVALID_RETENTION_DAYS = 0;

const MARKETING = {
  id: "marketing",
  label: { en: "Marketing" },
  icon: "i-ph-megaphone",
};

/** A settings read as a write takes it back: without its read-only fields. */
const settingsWriteSchema = z.object({
  fallbackLocale: z.string(),
  logRetentionDays: z.number(),
  blockOnMissingVariables: z.boolean(),
  senderName: z.string(),
  senderEmail: z.string(),
  replyTo: z.string(),
  webhookSecret: z.string(),
  categories: z.array(z.object({ id: z.string() }).passthrough()),
  missingVariables: z.enum(["refuse", "send"]),
});

type SettingsWrite = z.infer<typeof settingsWriteSchema>;

describe("[integration] settings form", () => {
  it("applies a partial post without touching the other fields", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const initial = await client.get("/api/mailing/settings");
    expect(initial.data.webhookUrl).to.match(/\/api\/mailing\/events\//);
    expect(initial.data.missingVariables).to.be.oneOf(["refuse", "send"]);

    const partial = await client.put("/api/mailing/settings", {
      senderName: "Acme Supplies",
      missingVariables: "refuse",
    });
    expect(partial.status, JSON.stringify(partial.data)).to.equal(HTTP_OK);
    const after = await client.get("/api/mailing/settings");
    expect(after.data.senderName).to.equal("Acme Supplies");
    expect(after.data.blockOnMissingVariables).to.equal(true);
    expect(after.data.categories).to.deep.equal(initial.data.categories);
    expect(after.data.fallbackLocale).to.equal(initial.data.fallbackLocale);

    const restored = await client.put("/api/mailing/settings", {
      senderName: initial.data.senderName,
      blockOnMissingVariables: initial.data.blockOnMissingVariables,
    });
    expect(restored.status).to.equal(HTTP_OK);
  });

  it("rotates the webhook secret and previews the retention", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const before = await client.get("/api/mailing/settings");
    const rotated = await client.post(
      "/api/mailing/settings/webhook-secret/rotate",
      {},
    );
    expect(rotated.status).to.equal(HTTP_OK);
    expect(rotated.data.value).to.have.length(48);
    expect(rotated.data.value).to.not.equal(before.data.webhookSecret);
    const after = await client.get("/api/mailing/settings");
    expect(after.data.webhookSecret).to.equal(rotated.data.value);

    const preview = await client.get(
      "/api/mailing/settings/retention-preview?days=30",
    );
    expect(preview.status).to.equal(HTTP_OK);
    expect(preview.data.days).to.equal(30);
    expect(preview.data.count).to.be.a("number");

    const usage = await client.get("/api/mailing/settings/category-usage");
    expect(usage.status).to.equal(HTTP_OK);
    expect(usage.data.counts).to.be.an("object");
  });
});

describe("[integration] settings", () => {
  it("returns defaults, accepts an update and rejects an invalid retention", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const initial = await client.get("/api/mailing/settings");
    expect(initial.status).to.equal(HTTP_OK);
    expect(initial.data.fallbackLocale).to.equal("en");
    expect(initial.data.logRetentionDays).to.equal(DEFAULT_RETENTION_DAYS);
    expect(initial.data.categories).to.have.length(DEFAULT_CATEGORY_COUNT);

    const update = await client.put("/api/mailing/settings", {
      ...settingsWriteSchema.parse(initial.data),
      fallbackLocale: "fr",
      logRetentionDays: UPDATED_RETENTION_DAYS,
      blockOnMissingVariables: true,
    });
    expect(update.status).to.equal(HTTP_OK);
    const after = await client.get("/api/mailing/settings");
    expect(after.data.fallbackLocale).to.equal("fr");
    expect(after.data.blockOnMissingVariables).to.equal(true);

    const invalid = await client.put("/api/mailing/settings", {
      ...settingsWriteSchema.parse(after.data),
      logRetentionDays: INVALID_RETENTION_DAYS,
    });
    expect(invalid.status).to.equal(HTTP_BAD_REQUEST);

    /**
     * Blanking the secret would leave the unauthenticated event endpoint with
     * no gate, so the write has to be refused rather than silently accepted.
     */
    const blankSecret = await client.put("/api/mailing/settings", {
      ...settingsWriteSchema.parse(after.data),
      webhookSecret: "",
    });
    expect(blankSecret.status).to.equal(HTTP_BAD_REQUEST);

    const restored = await client.put(
      "/api/mailing/settings",
      settingsWriteSchema.parse(initial.data),
    );
    expect(restored.status).to.equal(HTTP_OK);
  });
});

const CONCURRENT_READERS = 5;
const OTHER_SECRET = "l".repeat(48);

async function loadSettingsModules() {
  const { GetModel } =
    await import("@antelopejs/interface-database-decorators");
  const { SettingsModel } = await import("../../db");
  const settings = await import("../../services/settings");
  return {
    ...settings,
    rowsOf: (tenantId: string) => GetModel(SettingsModel, tenantId).getAll(),
  };
}

describe("[integration] settings row per tenant", () => {
  /**
   * Every request path reads the settings, so a tenant's first reads arrive
   * together. Each used to insert its own default row with its own webhook
   * secret; the row is now keyed by the tenant id so only one can land.
   */
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

  it("saves a tenant's first settings under the tenant id", async () => {
    const { getSettings, saveSettings, rowsOf } = await loadSettingsModules();
    const tenantId = `settings-first-save-${Date.now()}`;
    const values = await getSettings(`settings-template-${Date.now()}`);

    await saveSettings(tenantId, { ...values, webhookSecret: OTHER_SECRET });

    const rows = await rowsOf(tenantId);
    expect(rows).to.have.lengthOf(1);
    expect(rows[0]?._id).to.equal(tenantId);
    expect(rows[0]?.webhookSecret).to.equal(OTHER_SECRET);
  });
});

interface SettingsIssue {
  path: Array<string | number>;
  message: string;
}

interface IssuesBody {
  issues?: SettingsIssue[];
}

async function ownerClient(): Promise<AxiosInstance> {
  const session = await ensureOwnerSession();
  return authorizedClient(session.accessToken);
}

/** Puts back the fields a test changes, whatever it left. */
async function restore(
  client: AxiosInstance,
  initial: SettingsWrite,
): Promise<void> {
  const { categories, senderName, senderEmail, replyTo, logRetentionDays } =
    initial;
  const restored = await client.put(SETTINGS, {
    categories,
    senderName,
    senderEmail,
    replyTo,
    logRetentionDays,
  });
  expect(restored.status, JSON.stringify(restored.data)).to.equal(HTTP_OK);
}

const issuePaths = (data: IssuesBody): string[] =>
  (data.issues ?? []).map((issue) => issue.path.join("."));

describe("[integration] settings writes (partial, checked)", () => {
  it("puts only the fields sent: a stale tab cannot bring back an old secret", async () => {
    const client = await ownerClient();
    const staleTab = await client.get(SETTINGS);
    const rotated = await client.post(`${SETTINGS}/webhook-secret/rotate`, {});
    expect(rotated.status).to.equal(HTTP_OK);

    const saved = await client.put(SETTINGS, { senderName: "fix-L7 Acme" });
    expect(saved.status, JSON.stringify(saved.data)).to.equal(HTTP_OK);
    const after = await client.get(SETTINGS);
    expect(after.data.webhookSecret).to.equal(rotated.data.value);
    expect(after.data.logRetentionDays).to.equal(
      staleTab.data.logRetentionDays,
    );
    expect(after.data.categories).to.deep.equal(staleTab.data.categories);
    await restore(client, settingsWriteSchema.parse(staleTab.data));
  });

  it("answers 400, never 500, to a body that is not a settings patch", async () => {
    const client = await ownerClient();
    const bodies = ['"hello"', "[1,2]", "{not json", '{"bogus":1}'];
    for (const body of bodies) {
      const response = await client.put(SETTINGS, Buffer.from(body), {
        headers: JSON_HEADERS,
      });
      expect(response.status, body).to.equal(HTTP_BAD_REQUEST);
    }
    const unknownPolicy = await client.put(SETTINGS, {
      missingVariables: "bogus",
    });
    expect(unknownPolicy.status).to.equal(HTTP_BAD_REQUEST);
    expect(issuePaths(unknownPolicy.data)).to.deep.equal(["missingVariables"]);
  });

  it("names the field a refused value belongs to", async () => {
    const client = await ownerClient();
    const shortSecret = await client.put(SETTINGS, { webhookSecret: "abc" });
    expect(shortSecret.status).to.equal(HTTP_BAD_REQUEST);
    expect(shortSecret.data.issues[0].path).to.deep.equal(["webhookSecret"]);
    expect(shortSecret.data.issues[0].message).to.equal(
      "$dms_mailing.settings.fields.webhookSecret.too_short",
    );

    const refused = {
      senderName: "fix-L7\r\nBcc: evil@example.com",
      fallbackLocale: "not a locale",
      senderEmail: "not an address",
    };
    for (const [field, value] of Object.entries(refused)) {
      const response = await client.put(SETTINGS, { [field]: value });
      expect(response.status, field).to.equal(HTTP_BAD_REQUEST);
      expect(issuePaths(response.data), field).to.deep.equal([field]);
    }
  });

  it("trims the addresses it stores", async () => {
    const client = await ownerClient();
    const initial = await client.get(SETTINGS);
    const saved = await client.put(SETTINGS, {
      senderEmail: "  fix-l7@example.com ",
      replyTo: " ",
    });
    expect(saved.status, JSON.stringify(saved.data)).to.equal(HTTP_OK);
    const after = await client.get(SETTINGS);
    expect(after.data.senderEmail).to.equal("fix-l7@example.com");
    expect(after.data.replyTo).to.equal("");
    await restore(client, settingsWriteSchema.parse(initial.data));
  });

  it("refuses duplicate, blank or free-form categories", async () => {
    const client = await ownerClient();
    const category = {
      id: "fix-l7-dup",
      label: { en: "fix-L7 Dup" },
      icon: "i-ph-gift",
    };
    const lists = [
      [MARKETING, category, { ...category, label: { en: "fix-L7 Other" } }],
      [MARKETING, { ...category, label: { en: "   " } }],
      [MARKETING, { ...category, id: "fix l7/<b>" }],
      [MARKETING, { ...category, icon: "not-an-icon" }],
    ];
    for (const categories of lists) {
      const response = await client.put(SETTINGS, { categories });
      expect(response.status, JSON.stringify(categories)).to.equal(
        HTTP_BAD_REQUEST,
      );
      expect(issuePaths(response.data)[0]).to.match(/^categories\./);
    }
    const stored = (await client.get(SETTINGS)).data.categories;
    const asText = await client.put(SETTINGS, {
      categories: JSON.stringify(stored),
    });
    expect(asText.status).to.equal(HTTP_BAD_REQUEST);
  });

  it("keeps the marketing category, renamed or not", async () => {
    const client = await ownerClient();
    const initial = await client.get(SETTINGS);
    const { categories: stored } = settingsWriteSchema.parse(initial.data);
    const others = stored.filter((entry) => entry.id !== MARKETING.id);
    const dropped = await client.put(SETTINGS, { categories: others });
    expect(dropped.status).to.equal(HTTP_BAD_REQUEST);
    expect(issuePaths(dropped.data)).to.deep.equal(["categories"]);
    const renamed = await client.put(SETTINGS, {
      categories: [
        ...others,
        { ...MARKETING, label: { en: "fix-L7 Campaigns" } },
      ],
    });
    expect(renamed.status, JSON.stringify(renamed.data)).to.equal(HTTP_OK);
    await restore(client, settingsWriteSchema.parse(initial.data));
  });

  it("takes only a PUT of the writable fields", async () => {
    const client = await ownerClient();
    const read = await client.get(SETTINGS);
    const echo = await client.put(SETTINGS, read.data);
    expect(echo.status).to.equal(HTTP_BAD_REQUEST);
    const posted = await client.post(SETTINGS, { senderName: "fix-L7" });
    expect(posted.status).to.equal(HTTP_NOT_FOUND);
  });

  it("bounds the retention preview", async () => {
    const client = await ownerClient();
    for (const days of ["99999", "0", "-5", "1.5", "abc"]) {
      const response = await client.get(
        `${SETTINGS}/retention-preview?days=${days}`,
      );
      expect(response.status, days).to.equal(HTTP_BAD_REQUEST);
    }
    const stored = await client.get(`${SETTINGS}/retention-preview`);
    expect(stored.status).to.equal(HTTP_OK);
  });
});

describe("[integration] settings categories in use", () => {
  const ALPHA = {
    id: "fix-l7-alpha",
    label: { en: "fix-L7 Alpha" },
    icon: "i-ph-gift",
  };
  const BETA = {
    id: "fix-l7-beta",
    label: { en: "fix-L7 Beta" },
    icon: "i-ph-bell",
  };

  async function createTemplate(
    client: AxiosInstance,
    slug: string,
  ): Promise<string> {
    const created = await client.post(`${TEMPLATES_TABLE}/new`, {
      slug,
      name: slug,
      category: ALPHA.id,
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    return checkedText.parse(created.data._id);
  }

  const categoryOf = async (client: AxiosInstance, id: string) =>
    (await client.get(`${TEMPLATES_TABLE}/get?id=${id}`)).data.category ?? "";

  it("counts the active templates and moves those of a removed category", async () => {
    const client = await ownerClient();
    const initial = await client.get(SETTINGS);
    const { categories: kept } = settingsWriteSchema.parse(initial.data);
    const added = await client.put(SETTINGS, {
      categories: [...kept, ALPHA, BETA],
    });
    expect(added.status, JSON.stringify(added.data)).to.equal(HTTP_OK);
    const stamp = Date.now();
    const moved = await createTemplate(client, `fix-l7-moved-${stamp}`);
    const archived = await createTemplate(client, `fix-l7-archived-${stamp}`);
    await client.post(`/api/mailing/templates/${archived}/archive`, {});

    const usage = await client.get(`${SETTINGS}/category-usage`);
    expect(usage.data.counts[ALPHA.id]).to.equal(1);

    const removed = await client.put(SETTINGS, {
      categories: [...kept, BETA, { ...ALPHA, moveTo: BETA.id }],
    });
    expect(removed.status, JSON.stringify(removed.data)).to.equal(HTTP_OK);
    expect(removed.data.notice.params.count).to.equal(2);
    expect(removed.data.categories).to.deep.equal([...kept, BETA]);
    expect(await categoryOf(client, moved)).to.equal(BETA.id);

    const dropped = await client.put(SETTINGS, { categories: kept });
    expect(dropped.status, JSON.stringify(dropped.data)).to.equal(HTTP_OK);
    expect(await categoryOf(client, moved)).to.equal("");
    await restore(client, settingsWriteSchema.parse(initial.data));
  });
});
