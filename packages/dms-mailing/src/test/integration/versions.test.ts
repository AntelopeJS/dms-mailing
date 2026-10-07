import { expect } from "chai";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_CONFLICT = 409;
const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE = 422;
const TABLE = "/api/mailing/tables/templates";
const TEMPLATES = "/api/mailing/templates";

type Client = ReturnType<typeof authorizedClient>;

interface ChangeRow {
  locale: string;
  kind: string;
}

async function client(): Promise<Client> {
  const session = await ensureOwnerSession();
  return authorizedClient(session.accessToken);
}

async function createTemplate(api: Client, slug: string): Promise<string> {
  const created = await api.post(`${TABLE}/new`, {
    slug,
    name: slug,
    category: "orders",
  });
  expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
  return created.data[0] as string;
}

function withSubject(subject: string) {
  return {
    content: {
      locales: { en: { subject, preheader: "", blocks: [] } },
    },
  };
}

describe("[integration] template drafts and versions", () => {
  it("keeps customers on the published version while a draft waits", async () => {
    const api = await client();
    const id = await createTemplate(api, "versioned");
    await api.post(`${TEMPLATES}/${id}/content`, withSubject("First"));
    const first = await api.post(`${TEMPLATES}/${id}/publish`, {});
    expect(first.status, JSON.stringify(first.data)).to.equal(HTTP_OK);
    expect(first.data.version).to.equal(1);

    const saved = await api.post(
      `${TEMPLATES}/${id}/content`,
      withSubject("Second"),
    );
    expect(saved.data.changes).to.deep.equal([
      { locale: "en", kind: "subject" },
    ]);
    const pending = await api.get(`${TEMPLATES}/${id}/content`);
    expect(pending.data.hasDraft).to.equal(true);
    expect(pending.data.version).to.equal(1);
    expect(pending.data.content.locales.en.subject).to.equal("Second");
    expect(pending.data.publishedContent.locales.en.subject).to.equal("First");

    const live = await api.post(`${TEMPLATES}/${id}/preview`, {
      version: "published",
    });
    expect(live.data.subject).to.equal("First");

    const second = await api.post(`${TEMPLATES}/${id}/publish`, {});
    expect(second.data.version).to.equal(2);
    expect(
      second.data.changes.map((change: ChangeRow) => change.kind),
    ).to.deep.equal(["subject"]);

    const history = await api.get(`${TEMPLATES}/${id}/versions`);
    expect(
      history.data.versions.map((row: { version: number }) => row.version),
    ).to.deep.equal([2, 1]);
    const v1 = await api.post(`${TEMPLATES}/${id}/preview`, { version: 1 });
    expect(v1.data.subject).to.equal("First");
  });

  it("discards a draft back to the published content", async () => {
    const api = await client();
    const id = await createTemplate(api, "discarded");
    await api.post(`${TEMPLATES}/${id}/content`, withSubject("Kept"));
    await api.post(`${TEMPLATES}/${id}/publish`, {});
    await api.post(`${TEMPLATES}/${id}/content`, withSubject("Dropped"));

    const discarded = await api.post(`${TEMPLATES}/${id}/discard`, {});
    expect(discarded.status).to.equal(HTTP_OK);
    const after = await api.get(`${TEMPLATES}/${id}/content`);
    expect(after.data.hasDraft).to.equal(false);
    expect(after.data.changes).to.deep.equal([]);
    expect(after.data.content.locales.en.subject).to.equal("Kept");
  });

  it("only allows the lifecycle moves that make sense", async () => {
    const api = await client();
    const id = await createTemplate(api, "lifecycle");
    const unpublishDraft = await api.post(`${TEMPLATES}/${id}/unpublish`, {});
    expect(unpublishDraft.status).to.equal(HTTP_CONFLICT);
    const restoreDraft = await api.post(`${TEMPLATES}/${id}/restore`, {});
    expect(restoreDraft.status).to.equal(HTTP_CONFLICT);

    await api.post(`${TEMPLATES}/${id}/content`, withSubject("Hello"));
    await api.post(`${TEMPLATES}/${id}/publish`, {});
    const archived = await api.post(`${TEMPLATES}/${id}/archive`, {});
    expect(archived.data.status).to.equal("archived");
    const publishArchived = await api.post(`${TEMPLATES}/${id}/publish`, {});
    expect(publishArchived.status).to.equal(HTTP_CONFLICT);
    const restored = await api.post(`${TEMPLATES}/${id}/restore`, {});
    expect(restored.data.status).to.equal("draft");

    const republished = await api.post(`${TEMPLATES}/${id}/publish`, {});
    expect(republished.data.version).to.equal(1);
    const history = await api.get(`${TEMPLATES}/${id}/versions`);
    expect(history.data.versions).to.have.length(1);
  });

  it("refuses to publish a template without any locale", async () => {
    const api = await client();
    const id = await createTemplate(api, "empty-publish");
    await api.post(`${TEMPLATES}/${id}/content`, { content: { locales: {} } });
    const refused = await api.post(`${TEMPLATES}/${id}/publish`, {});
    expect(refused.status).to.equal(HTTP_UNPROCESSABLE);
  });

  it("creates a template from a starter with its variables and test data", async () => {
    const api = await client();
    const starters = await api.get(`${TEMPLATES}/starters`);
    expect(
      starters.data.starters.map((starter: { id: string }) => starter.id),
    ).to.include("password-reset");
    const created = await api.post(`${TABLE}/new`, {
      slug: "starter-reset",
      name: "Password reset",
      starterId: "password-reset",
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    const content = await api.get(`${TEMPLATES}/${created.data[0]}/content`);
    expect(content.data.template.status).to.equal("draft");
    expect(Object.keys(content.data.content.locales)).to.have.members([
      "en",
      "fr",
    ]);
    expect(content.data.variables.length).to.be.greaterThan(0);
    expect(content.data.testData.reset.url).to.be.a("string");

    const unknown = await api.post(`${TABLE}/new`, {
      slug: "starter-unknown",
      name: "Unknown",
      starterId: "nope",
    });
    expect(unknown.status).to.equal(HTTP_NOT_FOUND);
  });

  it("reports 30-day figures per template", async () => {
    const api = await client();
    const overview = await api.get(`${TEMPLATES}/overview`);
    expect(overview.status).to.equal(HTTP_OK);
    expect(overview.data.items.length).to.be.greaterThan(0);
    const first = overview.data.items[0];
    expect(first).to.have.keys([
      "id",
      "slug",
      "sends",
      "openRate",
      "problems",
      "lastSentAt",
    ]);
    const performance = await api.get(`${TEMPLATES}/${first.id}/performance`);
    expect(performance.data).to.have.property("sources");
    expect(performance.data).to.have.property("fallbacks");
  });
});
