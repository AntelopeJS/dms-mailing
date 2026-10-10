import { expect } from "chai";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
const TABLE = "/api/mailing/tables/templates";
const TEMPLATES = "/api/mailing/templates";
const SENDS = "/api/mailing/sends";

type Client = ReturnType<typeof authorizedClient>;

async function client(): Promise<Client> {
  const session = await ensureOwnerSession();
  return authorizedClient(session.accessToken);
}

async function liveTemplate(api: Client, slug: string): Promise<string> {
  const created = await api.post(`${TABLE}/new`, {
    slug,
    name: slug,
    category: "orders",
  });
  const id = created.data[0] as string;
  await api.post(`${TEMPLATES}/${id}/content`, {
    content: {
      locales: { en: { subject: "Published", preheader: "", blocks: [] } },
    },
  });
  await api.post(`${TEMPLATES}/${id}/publish`, {});
  return id;
}

async function markEvent(
  api: Client,
  sendId: string,
  type: string,
): Promise<void> {
  const settings = await api.get("/api/mailing/settings");
  const detail = await api.get(`${SENDS}/${sendId}`);
  const hook = await api.post(
    "/api/mailing/events/manual",
    { messageId: detail.data.send.providerMessageId, type },
    { headers: { "x-mailing-webhook-secret": settings.data.webhookSecret } },
  );
  expect(hook.status, JSON.stringify(hook.data)).to.equal(HTTP_OK);
}

describe("[integration] send lifecycle", () => {
  it("records version, requested locale and stage on a real send", async () => {
    const api = await client();
    const id = await liveTemplate(api, "real-versioned");
    const sent = await api.post(`${TEMPLATES}/${id}/send`, {
      to: ["real@example.test"],
      locale: "de",
    });
    expect(sent.status, JSON.stringify(sent.data)).to.equal(HTTP_OK);
    const detail = await api.get(`${SENDS}/${sent.data.results[0].sendId}`);
    expect(detail.data.send).to.deep.include({
      templateVersion: 1,
      requestedLocale: "de",
      locale: "en",
      isTest: false,
    });
    expect(detail.data.send.stage).to.be.oneOf(["in_progress", "delivered"]);
    expect(detail.data.template).to.deep.include({
      id,
      status: "live",
      publishedVersion: 1,
    });

    const list = await api.get("/api/mailing/tables/sends/list?limit=100");
    const row = list.data.results.find(
      (item: { _id: string }) => item._id === sent.data.results[0].sendId,
    );
    expect(row.localeLabel).to.equal("EN");
    expect(row.localeFallback).to.deep.equal({
      text: {
        key: "$dms_mailing.sends.locale_fallback",
        params: { requested: "DE" },
      },
      tone: "warning",
    });
  });

  it("test-sends a draft and refuses a real send of it", async () => {
    const api = await client();
    const created = await api.post(`${TABLE}/new`, {
      slug: "draft-only",
      name: "Draft only",
      category: "orders",
    });
    const id = created.data[0] as string;
    const test = await api.post(`${TEMPLATES}/${id}/test-send`, {
      to: ["draft@example.test"],
      locale: "en",
    });
    expect(test.status, JSON.stringify(test.data)).to.equal(HTTP_OK);
    const detail = await api.get(`${SENDS}/${test.data.results[0].sendId}`);
    expect(detail.data.send.templateVersion).to.equal(0);
    const real = await api.post(`${TEMPLATES}/${id}/send`, {
      to: ["draft@example.test"],
    });
    expect(real.status).to.equal(HTTP_UNPROCESSABLE);
    expect(JSON.stringify(real.data)).to.contain("template_not_live");
  });

  it("renders what a send carried, from its version", async () => {
    const api = await client();
    const id = await liveTemplate(api, "rendered-version");
    const sent = await api.post(`${TEMPLATES}/${id}/send`, {
      to: ["render@example.test"],
    });
    await api.post(`${TEMPLATES}/${id}/content`, {
      content: {
        locales: { en: { subject: "Changed", preheader: "", blocks: [] } },
      },
    });
    await api.post(`${TEMPLATES}/${id}/publish`, {});
    const html = await api.get(`${SENDS}/${sent.data.results[0].sendId}/html`);
    expect(html.status).to.equal(HTTP_OK);
    expect(html.data.subject).to.equal("Published");
    expect(html.data.version).to.equal(1);
  });

  it("sends a bounce again only to a corrected address", async () => {
    const api = await client();
    const id = await liveTemplate(api, "bounce-fix");
    const sent = await api.post(`${TEMPLATES}/${id}/send`, {
      to: ["wrong@example.test"],
    });
    const sendId = sent.data.results[0].sendId as string;
    await markEvent(api, sendId, "bounced");
    const bounced = await api.get(`${SENDS}/${sendId}`);
    expect(bounced.data.send.stage).to.equal("problem");

    const same = await api.post(`${SENDS}/${sendId}/replay`, {});
    expect(same.status).to.equal(HTTP_CONFLICT);
    expect(JSON.stringify(same.data)).to.contain("replay_needs_new_address");

    const fixed = await api.post(`${SENDS}/${sendId}/replay`, {
      to: "right@example.test",
    });
    expect(fixed.status, JSON.stringify(fixed.data)).to.equal(HTTP_OK);
    const resent = await api.get(`${SENDS}/${fixed.data.sendId}`);
    expect(resent.data.send).to.deep.include({
      recipientEmail: "right@example.test",
      templateVersion: 1,
      source: "dms-mailing:fix-address",
    });
  });

  it("never sends again after a spam report", async () => {
    const api = await client();
    const id = await liveTemplate(api, "spam-report");
    const sent = await api.post(`${TEMPLATES}/${id}/send`, {
      to: ["spam@example.test"],
    });
    const sendId = sent.data.results[0].sendId as string;
    await markEvent(api, sendId, "spam");
    const refused = await api.post(`${SENDS}/${sendId}/replay`, {
      to: "other@example.test",
    });
    expect(refused.status).to.equal(HTTP_CONFLICT);
    expect(JSON.stringify(refused.data)).to.contain("no_replay_after_spam");
  });

  it("answers the stat strip and the provider banner", async () => {
    const api = await client();
    const stats = await api.get(`${SENDS}/stats`);
    expect(stats.status, JSON.stringify(stats.data)).to.equal(HTTP_OK);
    expect(stats.data.sends).to.be.a("number");
    expect(stats.data.tests).to.be.a("number");
    expect(stats.data.items).to.be.an("array");
    const banner = await api.get(`${SENDS}/banner`);
    expect(banner.status).to.equal(HTTP_OK);
    expect(banner.data || null).to.equal(null);
    const bulk = await api.post(`${SENDS}/replay-failed`, {});
    expect(bulk.status, JSON.stringify(bulk.data)).to.equal(HTTP_OK);
    expect(bulk.data.count).to.be.a("number");
  });

  it("fills the stage of sends written before it existed", async () => {
    const { GetModel } =
      await import("@antelopejs/interface-database-decorators");
    const { DEFAULT_TENANT_ID } =
      await import("@antelopejs/interface-dms/constants");
    const { SendModel } = await import("../../db");
    const { backfillSendStages } = await import("../../services/stages");
    const sends = GetModel(SendModel, DEFAULT_TENANT_ID);
    const [legacyId] = await sends.table
      .insert({
        _id: `legacy-${Date.now()}`,
        createdAt: new Date(),
        templateId: "gone",
        templateSlug: "gone",
        locale: "en",
        recipientEmail: "legacy@example.test",
        status: "bounced",
        latencyMs: 1,
        json_variables: "{}",
        opens: 0,
        clicks: 0,
        revision: "r",
        isTest: false,
      })
      .run();
    expect(await backfillSendStages()).to.be.greaterThan(0);
    const legacy = await sends.get(legacyId as string);
    expect(legacy?.stage).to.equal("problem");
    await sends.delete(legacyId as string);
  });
});
