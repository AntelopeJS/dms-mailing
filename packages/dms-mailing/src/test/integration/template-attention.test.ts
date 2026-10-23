import { expect } from "chai";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const TABLE = "/api/mailing/tables/templates";
const TEMPLATES = "/api/mailing/templates";
const ATTENTION_FILTER = "filter_needsAttention=is:true";

type Client = ReturnType<typeof authorizedClient>;

interface AttentionRow {
  _id: string;
  attention: string;
}

async function client(): Promise<Client> {
  const session = await ensureOwnerSession();
  return authorizedClient(session.accessToken);
}

async function liveTemplate(api: Client, slug: string): Promise<string> {
  const created = await api.post(`${TABLE}/new`, { slug, name: slug });
  expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
  const id = created.data._id as string;
  await api.post(`${TEMPLATES}/${id}/content`, {
    content: {
      locales: { en: { subject: "Published", preheader: "", blocks: [] } },
    },
  });
  const published = await api.post(`${TEMPLATES}/${id}/publish`, {});
  expect(published.status, JSON.stringify(published.data)).to.equal(HTTP_OK);
  return id;
}

async function attentionRow(
  api: Client,
  slug: string,
): Promise<AttentionRow | undefined> {
  const list = await api.get(
    `${TABLE}/list?limit=20&search=${slug}&${ATTENTION_FILTER}`,
  );
  expect(list.status, JSON.stringify(list.data)).to.equal(HTTP_OK);
  return (list.data.results as AttentionRow[])[0];
}

describe("[integration] templates needing attention", () => {
  it("lists a live template no real send used, until one does", async () => {
    const api = await client();
    const slug = `attention-unsent-${Date.now()}`;
    const id = await liveTemplate(api, slug);

    const flagged = await attentionRow(api, slug);
    expect(flagged?._id).to.equal(id);
    expect(flagged?.attention).to.equal("never_sent");

    const sent = await api.post(`${TEMPLATES}/${id}/send`, {
      to: ["attention@example.test"],
    });
    expect(sent.status, JSON.stringify(sent.data)).to.equal(HTTP_OK);
    expect(await attentionRow(api, slug)).to.equal(undefined);
  });
});
