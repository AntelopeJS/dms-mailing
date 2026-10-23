import { expect } from "chai";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
const TABLE = "/api/mailing/tables/templates";
const TEMPLATES = "/api/mailing/templates";

type Client = ReturnType<typeof authorizedClient>;

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
  return created.data._id as string;
}

function withSubject(subject: string, revision?: number) {
  return {
    content: {
      locales: { en: { subject, preheader: "", blocks: [] } },
    },
    revision,
  };
}

async function revisionOf(api: Client, id: string): Promise<number> {
  const content = await api.get(`${TEMPLATES}/${id}/content`);
  return content.data.revision as number;
}

async function versionCount(api: Client, id: string): Promise<number> {
  const history = await api.get(`${TEMPLATES}/${id}/versions`);
  return history.data.versions.length as number;
}

describe("[integration] template draft revisions", () => {
  it("refuses a save or a publish behind the stored draft", async () => {
    const api = await client();
    const id = await createTemplate(api, "content-conflict");
    const opened = await revisionOf(api, id);

    const first = await api.post(
      `${TEMPLATES}/${id}/content`,
      withSubject("Tab A", opened),
    );
    expect(first.status, JSON.stringify(first.data)).to.equal(HTTP_OK);
    expect(first.data.revision).to.equal(opened + 1);

    const stale = await api.post(
      `${TEMPLATES}/${id}/content`,
      withSubject("Tab B", opened),
    );
    expect(stale.status).to.equal(HTTP_CONFLICT);
    expect(JSON.stringify(stale.data)).to.contain("draft_conflict");

    const stalePublish = await api.post(`${TEMPLATES}/${id}/publish`, {
      revision: opened,
    });
    expect(stalePublish.status).to.equal(HTTP_CONFLICT);

    const after = await api.get(`${TEMPLATES}/${id}/content`);
    expect(after.data.content.locales.en.subject).to.equal("Tab A");
    expect(after.data.revision).to.equal(first.data.revision);

    const changes = await api.get(`${TEMPLATES}/${id}/changes`);
    expect(changes.data.revision).to.equal(first.data.revision);
    const published = await api.post(`${TEMPLATES}/${id}/publish`, {
      revision: first.data.revision,
    });
    expect(published.status, JSON.stringify(published.data)).to.equal(HTTP_OK);
  });

  it("reads the workspace policy for missing variables", async () => {
    const api = await client();
    const id = await createTemplate(api, "content-policy");
    const content = await api.get(`${TEMPLATES}/${id}/content`);
    expect(content.data.blockOnMissingVariables).to.be.a("boolean");
  });
});

describe("[integration] template publish guards", () => {
  it("drops a draft put back as it was published", async () => {
    const api = await client();
    const id = await createTemplate(api, "content-back");
    await api.post(`${TEMPLATES}/${id}/content`, withSubject("Same"));
    await api.post(`${TEMPLATES}/${id}/publish`, {});

    await api.post(`${TEMPLATES}/${id}/content`, withSubject("Other"));
    const back = await api.post(
      `${TEMPLATES}/${id}/content`,
      withSubject("Same"),
    );
    expect(back.data.changes).to.deep.equal([]);
    const content = await api.get(`${TEMPLATES}/${id}/content`);
    expect(content.data.hasDraft).to.equal(false);
    expect(content.data.template.isDraftPending).to.equal(false);
  });

  it("never writes a version without a change", async () => {
    const api = await client();
    const id = await createTemplate(api, "content-no-change");
    await api.post(`${TEMPLATES}/${id}/content`, withSubject("Once"));
    await api.post(`${TEMPLATES}/${id}/publish`, {});

    const again = await api.post(`${TEMPLATES}/${id}/publish`, {});
    expect(again.status).to.equal(HTTP_OK);
    expect(again.data.version).to.equal(1);
    expect(await versionCount(api, id)).to.equal(1);

    await api.post(`${TEMPLATES}/${id}/unpublish`, {});
    const unpublished = await api.get(`${TEMPLATES}/${id}/content`);
    expect(unpublished.data.template.unpublishedAt).to.be.a("string");
    const republished = await api.post(`${TEMPLATES}/${id}/publish`, {});
    expect(republished.data.version).to.equal(1);
    expect(await versionCount(api, id)).to.equal(1);
  });

  it("refuses to discard a template never published", async () => {
    const api = await client();
    const id = await createTemplate(api, "content-discard-new");
    const refused = await api.post(`${TEMPLATES}/${id}/discard`, {});
    expect(refused.status).to.equal(HTTP_CONFLICT);
    expect(JSON.stringify(refused.data)).to.contain("nothing_to_discard");
    const content = await api.get(`${TEMPLATES}/${id}/content`);
    expect(Object.keys(content.data.content.locales)).to.deep.equal(["en"]);
  });

  it("refuses to publish a locale without a subject", async () => {
    const api = await client();
    const id = await createTemplate(api, "content-no-subject");
    const refused = await api.post(`${TEMPLATES}/${id}/publish`, {});
    expect(refused.status).to.equal(HTTP_UNPROCESSABLE);
    expect(JSON.stringify(refused.data)).to.contain("empty_subject");
  });
});
