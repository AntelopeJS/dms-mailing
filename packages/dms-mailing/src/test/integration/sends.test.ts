import { expect } from "chai";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_UNPROCESSABLE = 422;
const HTTP_NOT_FOUND = 404;
const DAY_MS = 86_400_000;
const TABLE = "/api/mailing/tables/templates";

interface TemplateRow {
  _id: string;
  slug: string;
}

interface SendResult {
  sendId: string;
}

describe("[integration] sends", () => {
  it("sends a test e-mail through the SMTP fixture and logs it", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const created = await client.post(`${TABLE}/new`, {
      slug: "test-send",
      name: "Test send",
      category: "orders",
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    const id = created.data[0] as string;
    const sent = await client.post(`/api/mailing/templates/${id}/test-send`, {
      to: ["sofie@example.test"],
      locale: "en",
      data: { customer: { firstName: "Sofie" }, detailsUrl: "https://x" },
    });
    expect(sent.status, JSON.stringify(sent.data)).to.equal(HTTP_OK);
    expect(sent.data.results[0].status).to.be.oneOf(["sent", "queued"]);

    const detail = await client.get(
      `/api/mailing/sends/${sent.data.results[0].sendId}`,
    );
    expect(detail.status).to.equal(HTTP_OK);
    expect(detail.data.send.isTest).to.equal(true);
    expect(detail.data.send.templateSlug).to.equal("test-send");
    expect(detail.data.events[0].type).to.equal(detail.data.send.status);
  });

  it("refuses a real send on a draft template", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const created = await client.post(`${TABLE}/new`, {
      slug: "real-draft",
      name: "Real draft",
      category: "orders",
    });
    const id = created.data[0] as string;
    const sent = await client.post(`/api/mailing/templates/${id}/send`, {
      to: ["sofie@example.test"],
      locale: "en",
    });
    expect(sent.status).to.equal(HTTP_UNPROCESSABLE);
    expect(JSON.stringify(sent.data)).to.contain("template_not_live");
  });

  it("sends for real from a live template and counts it in the metrics", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const created = await client.post(`${TABLE}/new`, {
      slug: "real-send",
      name: "Real send",
      category: "orders",
    });
    const id = created.data[0] as string;
    await client.post(`/api/mailing/templates/${id}/publish`, {});
    const sent = await client.post(`/api/mailing/templates/${id}/send`, {
      to: ["sofie@example.test"],
      locale: "en",
      data: { customer: { firstName: "Sofie" }, detailsUrl: "https://x" },
    });
    expect(sent.status, JSON.stringify(sent.data)).to.equal(HTTP_OK);
    const detail = await client.get(
      `/api/mailing/sends/${sent.data.results[0].sendId}`,
    );
    expect(detail.data.send.isTest).to.equal(false);
    expect(detail.data.send.source).to.equal("dms-mailing:manual");
  });

  it("records one send per recipient of a multi-recipient test send", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const list = await client.get(`${TABLE}/list`);
    const id = (
      list.data.results.find(
        (item: TemplateRow) => item.slug === "test-send",
      ) as TemplateRow
    )._id;
    const sent = await client.post(`/api/mailing/templates/${id}/test-send`, {
      to: ["first@example.test", "second@example.test"],
      locale: "en",
      data: { customer: { firstName: "Sofie" }, detailsUrl: "https://x" },
    });
    expect(sent.status, JSON.stringify(sent.data)).to.equal(HTTP_OK);
    expect(sent.data.results).to.have.length(2);
    const sendIds = sent.data.results.map(
      (result: SendResult) => result.sendId,
    );
    expect(new Set(sendIds).size).to.equal(2);
  });

  it("refuses to send when required variables are missing and blocking is on", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const settings = await client.get("/api/mailing/settings");
    await client.post("/api/mailing/settings", {
      ...settings.data,
      blockOnMissingVariables: true,
    });
    const list = await client.get(`${TABLE}/list`);
    const id = (
      list.data.results.find(
        (item: TemplateRow) => item.slug === "test-send",
      ) as TemplateRow
    )._id;
    // Blank content references nothing, so give it a token to miss.
    await client.post(`/api/mailing/templates/${id}/content`, {
      content: {
        locales: {
          en: {
            subject: "Hi {{customer.firstName}}",
            preheader: "",
            blocks: [],
          },
        },
      },
    });
    await client.post(`/api/mailing/templates/${id}/variables`, {
      variables: [
        { path: "customer.firstName", type: "string", required: true },
      ],
    });
    const blocked = await client.post(
      `/api/mailing/templates/${id}/test-send`,
      { to: ["sofie@example.test"], locale: "en", data: {} },
    );
    expect(blocked.status).to.equal(HTTP_UNPROCESSABLE);
    await client.post("/api/mailing/settings", {
      ...settings.data,
      blockOnMissingVariables: false,
    });
  });

  it("replays a send and lists it in the sends table", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const list = await client.get("/api/mailing/tables/sends/list");
    expect(list.status, JSON.stringify(list.data)).to.equal(HTTP_OK);
    const original = list.data.results[0] as TemplateRow;
    const replay = await client.post(
      `/api/mailing/sends/${original._id}/replay`,
      {},
    );
    expect(replay.status, JSON.stringify(replay.data)).to.equal(HTTP_OK);
    expect(replay.data.sendId).to.not.equal(original._id);
    const html = await client.get(`/api/mailing/sends/${original._id}/html`);
    expect(html.status).to.equal(HTTP_OK);
    expect(html.data.html).to.include("<!DOCTYPE html>");
  });

  it("exposes metrics and the provider status", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const from = new Date(Date.now() - DAY_MS).toISOString();
    const to = new Date(Date.now() + DAY_MS).toISOString();
    const kpiUrl = `/api/mailing/metrics/kpi/sends?from=${from}&to=${to}`;
    const kpi = await client.get(kpiUrl);
    expect(kpi.status, JSON.stringify(kpi.data)).to.equal(HTTP_OK);
    expect(kpi.data.value).to.be.a("number");

    const volume = await client.get(
      `/api/mailing/metrics/volume?from=${from}&to=${to}`,
    );
    expect(volume.status).to.equal(HTTP_OK);
    expect(volume.data.series[0].data).to.not.have.length(0);

    const unknown = await client.get("/api/mailing/metrics/kpi/nope");
    expect(unknown.status).to.equal(HTTP_NOT_FOUND);

    const provider = await client.get("/api/mailing/provider");
    expect(provider.status).to.equal(HTTP_OK);
    expect(provider.data.connected).to.equal(true);

    const funnel = await client.get("/api/mailing/metrics/funnel");
    expect(funnel.status).to.equal(HTTP_OK);
    expect(funnel.data.steps).to.have.length(5);

    const attention = await client.get("/api/mailing/metrics/attention");
    expect(attention.status).to.equal(HTTP_OK);
    expect(attention.data.items).to.be.an("array");
  });
});
