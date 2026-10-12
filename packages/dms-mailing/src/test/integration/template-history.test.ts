import { expect } from "chai";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_CONFLICT = 409;
const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE = 422;
const TABLE = "/api/mailing/tables/templates";
const TEMPLATES = "/api/mailing/templates";
const RECIPIENT = "history@example.test";

type Client = ReturnType<typeof authorizedClient>;

interface Declaration {
  path: string;
  type: string;
  required: boolean;
}

interface ChangeRow {
  locale: string;
  kind: string;
  variable?: string;
}

const ORDER_ID: Declaration = {
  path: "order.id",
  type: "string",
  required: true,
};

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

interface DraftBody {
  content: unknown;
  variables?: Declaration[];
}

/** A draft save; without declarations, the draft keeps its own. */
function draft(subject: string, variables?: Declaration[]): DraftBody {
  const body: DraftBody = {
    content: { locales: { en: { subject, preheader: "", blocks: [] } } },
  };
  if (variables) body.variables = variables;
  return body;
}

async function publish(api: Client, id: string): Promise<number> {
  const published = await api.post(`${TEMPLATES}/${id}/publish`, {});
  expect(published.status, JSON.stringify(published.data)).to.equal(HTTP_OK);
  return published.data.version as number;
}

describe("[integration] template history and restore", () => {
  it("restores a version as a draft, customers staying on the live one", async () => {
    const api = await client();
    const id = await createTemplate(api, "history-restore");
    await api.post(`${TEMPLATES}/${id}/content`, draft("First", [ORDER_ID]));
    await publish(api, id);
    await api.post(`${TEMPLATES}/${id}/content`, draft("Second", []));
    expect(await publish(api, id)).to.equal(2);

    const history = await api.get(`${TEMPLATES}/${id}/versions`);
    expect(history.data.versions[1].variables).to.deep.equal([ORDER_ID]);

    const before = await api.get(`${TEMPLATES}/${id}/content`);
    const restored = await api.post(`${TEMPLATES}/${id}/versions/1/restore`, {
      revision: before.data.revision,
    });
    expect(restored.status, JSON.stringify(restored.data)).to.equal(HTTP_OK);
    expect(restored.data.revision).to.equal(before.data.revision + 1);
    expect(
      restored.data.changes.map((change: ChangeRow) => change.kind),
    ).to.deep.equal(["subject", "variable_added"]);

    const after = await api.get(`${TEMPLATES}/${id}/content`);
    expect(after.data.hasDraft).to.equal(true);
    expect(after.data.content.locales.en.subject).to.equal("First");
    expect(after.data.variables).to.deep.equal([ORDER_ID]);
    expect(after.data.publishedContent.locales.en.subject).to.equal("Second");
    expect(after.data.publishedVariables).to.deep.equal([]);
    expect(await publish(api, id)).to.equal(3);
  });

  it("refuses a restore behind the draft or of an unknown version", async () => {
    const api = await client();
    const id = await createTemplate(api, "history-refused");
    await api.post(`${TEMPLATES}/${id}/content`, draft("Only"));
    await publish(api, id);
    const current = await api.get(`${TEMPLATES}/${id}/content`);

    const stale = await api.post(`${TEMPLATES}/${id}/versions/1/restore`, {
      revision: current.data.revision - 1,
    });
    expect(stale.status).to.equal(HTTP_CONFLICT);
    const missing = await api.post(`${TEMPLATES}/${id}/versions/9/restore`, {});
    expect(missing.status).to.equal(HTTP_NOT_FOUND);
    const invalid = await api.post(
      `${TEMPLATES}/${id}/versions/latest/restore`,
      {},
    );
    expect(invalid.status).to.equal(HTTP_NOT_FOUND);
  });

  it("leaves no draft when the live version itself is restored", async () => {
    const api = await client();
    const id = await createTemplate(api, "history-same");
    await api.post(`${TEMPLATES}/${id}/content`, draft("Live"));
    await publish(api, id);
    await api.post(`${TEMPLATES}/${id}/content`, draft("Pending"));

    await api.post(`${TEMPLATES}/${id}/versions/1/restore`, {});
    const after = await api.get(`${TEMPLATES}/${id}/content`);
    expect(after.data.hasDraft).to.equal(false);
    expect(after.data.changes).to.deep.equal([]);
  });
});

describe("[integration] variable declarations follow the draft", () => {
  it("keeps the published contract until a publish ships the declarations", async () => {
    const api = await client();
    const id = await createTemplate(api, "declarations-draft");
    await api.post(`${TEMPLATES}/${id}/content`, draft("Order {{order.id}}"));
    await publish(api, id);

    const saved = await api.post(
      `${TEMPLATES}/${id}/content`,
      draft("Order {{order.id}}", [ORDER_ID]),
    );
    expect(saved.data.changes).to.deep.equal([
      { locale: "", kind: "variable_added", variable: "order.id" },
    ]);
    const pending = await api.get(`${TEMPLATES}/${id}/content`);
    expect(pending.data.variables).to.deep.equal([ORDER_ID]);
    expect(pending.data.publishedVariables).to.deep.equal([]);
    expect(pending.data.publishedDetectedVariables).to.deep.equal(["order.id"]);

    const unchecked = await api.post(`${TEMPLATES}/${id}/send`, {
      to: [RECIPIENT],
      locale: "en",
      data: {},
    });
    expect(unchecked.status, JSON.stringify(unchecked.data)).to.equal(HTTP_OK);

    expect(await publish(api, id)).to.equal(2);
    const shipped = await api.get(`${TEMPLATES}/${id}/content`);
    expect(shipped.data.publishedVariables).to.deep.equal([ORDER_ID]);
    const refused = await api.post(`${TEMPLATES}/${id}/send`, {
      to: [RECIPIENT],
      locale: "en",
      data: {},
    });
    expect(refused.status).to.equal(HTTP_UNPROCESSABLE);
  });

  it("drops a draft whose declarations are put back as published", async () => {
    const api = await client();
    const id = await createTemplate(api, "declarations-clean");
    await api.post(`${TEMPLATES}/${id}/content`, draft("Hi", [ORDER_ID]));
    await publish(api, id);

    await api.post(`${TEMPLATES}/${id}/variables`, { variables: [] });
    const changed = await api.get(`${TEMPLATES}/${id}/content`);
    expect(changed.data.hasDraft).to.equal(true);
    expect(changed.data.publishedVariables).to.deep.equal([ORDER_ID]);

    await api.post(`${TEMPLATES}/${id}/content`, draft("Hi", [ORDER_ID]));
    const clean = await api.get(`${TEMPLATES}/${id}/content`);
    expect(clean.data.hasDraft).to.equal(false);
    expect(clean.data.changes).to.deep.equal([]);
  });

  it("discards draft declarations with the draft content", async () => {
    const api = await client();
    const id = await createTemplate(api, "declarations-discard");
    await api.post(`${TEMPLATES}/${id}/content`, draft("Hi"));
    await publish(api, id);
    await api.post(`${TEMPLATES}/${id}/content`, draft("Hi", [ORDER_ID]));

    await api.post(`${TEMPLATES}/${id}/discard`, {});
    const after = await api.get(`${TEMPLATES}/${id}/content`);
    expect(after.data.variables).to.deep.equal([]);
    expect(after.data.hasDraft).to.equal(false);
  });
});
