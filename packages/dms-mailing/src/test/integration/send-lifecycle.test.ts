import { expect } from "chai";
import { authorizedClient, eventsPath } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
const TABLE = "/api/mailing/tables/templates";
const TEMPLATES = "/api/mailing/templates";
const SENDS = "/api/mailing/sends";
const SUPPRESSIONS = "/api/mailing/suppressions";
const SUPPRESSIONS_TABLE = "/api/mailing/tables/suppressions";

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
  details: Record<string, unknown> = {},
): Promise<void> {
  const settings = await api.get("/api/mailing/settings");
  const detail = await api.get(`${SENDS}/${sendId}`);
  const hook = await api.post(
    eventsPath("manual"),
    { messageId: detail.data.send.providerMessageId, type, details },
    { headers: { "x-mailing-webhook-secret": settings.data.webhookSecret } },
  );
  expect(hook.status, JSON.stringify(hook.data)).to.equal(HTTP_OK);
}

async function sendOnce(api: Client, id: string, to: string): Promise<string> {
  const sent = await api.post(`${TEMPLATES}/${id}/send`, { to: [to] });
  expect(sent.status, JSON.stringify(sent.data)).to.equal(HTTP_OK);
  return sent.data.results[0].sendId as string;
}

async function sendsTo(api: Client, recipient: string): Promise<number> {
  const list = await api.get(
    `/api/mailing/tables/sends/list?limit=50&search=${encodeURIComponent(recipient)}`,
  );
  return (list.data.results as { recipientEmail: string }[]).filter(
    (row) => row.recipientEmail === recipient,
  ).length;
}

async function liftSuppression(api: Client, email: string): Promise<void> {
  const list = await api.get(
    `${SUPPRESSIONS_TABLE}/list?limit=50&search=${encodeURIComponent(email)}`,
  );
  const entry = (list.data.results as { _id: string; email: string }[]).find(
    (row) => row.email === email,
  );
  if (entry) await api.delete(`${SUPPRESSIONS}/${entry._id}`);
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

  it("links a send again to its original and resolves the original", async () => {
    const api = await client();
    const id = await liveTemplate(api, "replay-links");
    const sendId = await sendOnce(api, id, "links@example.test");
    await markEvent(api, sendId, "failed", { reason: "421 4.3.0 Try later" });

    const replay = await api.post(`${SENDS}/${sendId}/replay`, {});
    expect(replay.status, JSON.stringify(replay.data)).to.equal(HTTP_OK);
    const original = await api.get(`${SENDS}/${sendId}`);
    expect(original.data.send).to.deep.include({
      replayedBy: replay.data.sendId,
      stage: "resolved",
    });
    expect(original.data.send.resolvedAt).to.be.a("string");
    const resent = await api.get(`${SENDS}/${replay.data.sendId}`);
    expect(resent.data.send.replayOf).to.equal(sendId);
  });

  it("sends the failures again only once", async () => {
    const api = await client();
    const id = await liveTemplate(api, "replay-once");
    const recipient = "replay-once@example.test";
    const sendId = await sendOnce(api, id, recipient);
    await markEvent(api, sendId, "failed", { reason: "421 4.3.0 Try later" });

    const first = await api.post(`${SENDS}/replay-failed`, {});
    expect(first.status, JSON.stringify(first.data)).to.equal(HTTP_OK);
    const replayedBy = (await api.get(`${SENDS}/${sendId}`)).data.send
      .replayedBy as string;
    expect(replayedBy).to.be.a("string");

    const second = await api.post(`${SENDS}/replay-failed`, {});
    expect(second.status, JSON.stringify(second.data)).to.equal(HTTP_OK);
    const after = await api.get(`${SENDS}/${sendId}`);
    expect(after.data.send.replayedBy).to.equal(replayedBy);
    expect(await sendsTo(api, recipient)).to.equal(2);
  });

  it("treats a delivery after a failure as delivered", async () => {
    const api = await client();
    const id = await liveTemplate(api, "failed-then-delivered");
    const sendId = await sendOnce(api, id, "deferred@example.test");
    await markEvent(api, sendId, "failed", { reason: "421 4.3.0 Try later" });
    await markEvent(api, sendId, "delivered");
    const detail = await api.get(`${SENDS}/${sendId}`);
    expect(detail.data.send.status).to.equal("delivered");
    expect(detail.data.send.stage).to.equal("delivered");
    expect(detail.data.send.error || "").to.equal("");
  });

  it("refuses the bounced address whatever its case", async () => {
    const api = await client();
    const id = await liveTemplate(api, "bounce-case");
    const sendId = await sendOnce(api, id, "case@example.test");
    await markEvent(api, sendId, "bounced", { reason: "550 5.1.1 No user" });
    const same = await api.post(`${SENDS}/${sendId}/replay`, {
      to: " CASE@Example.test ",
    });
    expect(same.status).to.equal(HTTP_CONFLICT);
    expect(JSON.stringify(same.data)).to.contain("replay_needs_new_address");
  });

  it("sends a temporary bounce again to the same address", async () => {
    const api = await client();
    const id = await liveTemplate(api, "soft-bounce");
    const sendId = await sendOnce(api, id, "full@example.test");
    await markEvent(api, sendId, "bounced", {
      reason: "452 4.2.2 The recipient mailbox is full",
    });
    const bounced = await api.get(`${SENDS}/${sendId}`);
    expect(bounced.data.send.isSoftBounce).to.equal(true);
    const again = await api.post(`${SENDS}/${sendId}/replay`, {});
    expect(again.status, JSON.stringify(again.data)).to.equal(HTTP_OK);
    const resent = await api.get(`${SENDS}/${again.data.sendId}`);
    expect(resent.data.send).to.deep.include({
      recipientEmail: "full@example.test",
      source: "dms-mailing:replay",
    });
  });

  it("keeps the original a problem when the send again is suppressed", async () => {
    const api = await client();
    const id = await liveTemplate(api, "replay-suppressed");
    const recipient = "replay-suppressed@example.test";
    const sendId = await sendOnce(api, id, recipient);
    await markEvent(api, sendId, "failed", { reason: "421 4.3.0 Try later" });
    await api.post(SUPPRESSIONS, { email: recipient });

    const replay = await api.post(`${SENDS}/${sendId}/replay`, {});
    expect(replay.status, JSON.stringify(replay.data)).to.equal(HTTP_OK);
    expect(replay.data.status).to.equal("suppressed");
    expect(replay.data.warning).to.equal(
      "$dms_mailing.errors.suppressed.manual",
    );
    const original = await api.get(`${SENDS}/${sendId}`);
    expect(original.data.send.stage).to.equal("problem");
    expect(original.data.send.replayedBy || "").to.equal("");
    const blocked = await api.get(`${SENDS}/${replay.data.sendId}`);
    expect(blocked.data.send.replayOf).to.equal(sendId);

    const bulk = await api.post(`${SENDS}/replay-failed`, {});
    expect(bulk.status, JSON.stringify(bulk.data)).to.equal(HTTP_OK);
    expect(bulk.data.skipped).to.be.greaterThan(0);
    expect(
      bulk.data.results.some(
        (result: { status: string }) => result.status === "suppressed",
      ),
    ).to.equal(false);
    expect(bulk.data.warning).to.be.oneOf([
      "$dms_mailing.sends.banner.replay_skipped",
      "$dms_mailing.sends.banner.replay_partial",
    ]);
    const stillProblem = await api.get(`${SENDS}/${sendId}`);
    expect(stillProblem.data.send.stage).to.equal("problem");
    expect(stillProblem.data.send.replayedBy || "").to.equal("");
    await liftSuppression(api, recipient);
  });

  it("refuses an invalid address with a recipient error", async () => {
    const api = await client();
    const id = await liveTemplate(api, "invalid-recipient");
    const real = await api.post(`${TEMPLATES}/${id}/send`, { to: ["bad"] });
    expect(JSON.stringify(real.data)).to.contain("invalid_recipient");
    const test = await api.post(`${TEMPLATES}/${id}/test-send`, {
      to: ["bad"],
      locale: "en",
    });
    expect(JSON.stringify(test.data)).to.contain("invalid_recipient");
  });

  it("renders a draft test as a test, flagged as approximate", async () => {
    const api = await client();
    const created = await api.post(`${TABLE}/new`, {
      slug: "draft-rendering",
      name: "Draft rendering",
      category: "orders",
    });
    const id = created.data[0] as string;
    await api.post(`${TEMPLATES}/${id}/content`, {
      content: {
        locales: { en: { subject: "Draft", preheader: "", blocks: [] } },
      },
    });
    const test = await api.post(`${TEMPLATES}/${id}/test-send`, {
      to: ["draft-rendering@example.test"],
      locale: "en",
    });
    const html = await api.get(`${SENDS}/${test.data.results[0].sendId}/html`);
    expect(html.status, JSON.stringify(html.data)).to.equal(HTTP_OK);
    expect(html.data.subject).to.equal("[TEST] Draft");
    expect(html.data.approximate).to.equal(true);
  });
});
