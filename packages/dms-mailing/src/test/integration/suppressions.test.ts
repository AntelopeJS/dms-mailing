import { expect } from "chai";
import { z } from "zod";
import { authorizedClient, eventsPath } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";
import { checkedText } from "../helpers/checked";
import type { JsonObject } from "../../types/json";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const TABLE = "/api/mailing/tables/templates";
const TEMPLATES = "/api/mailing/templates";
const SENDS = "/api/mailing/sends";
const SUPPRESSIONS = "/api/mailing/suppressions";
const SUPPRESSIONS_TABLE = "/api/mailing/tables/suppressions";

type Client = ReturnType<typeof authorizedClient>;

const suppressionRowSchema = z.object({
  _id: z.string(),
  email: z.string(),
  reason: z.string(),
  sendId: z.string().optional(),
});

type SuppressionRow = z.infer<typeof suppressionRowSchema>;

const sentResultsSchema = z.array(
  z.object({
    sendId: z.string(),
    status: z.string(),
    error: z.string().optional(),
  }),
);

async function client(): Promise<{ api: Client; email: string }> {
  const session = await ensureOwnerSession();
  return { api: authorizedClient(session.accessToken), email: session.email };
}

async function liveTemplate(api: Client, slug: string): Promise<string> {
  const created = await api.post(`${TABLE}/new`, {
    slug,
    name: slug,
    category: "orders",
  });
  const id = checkedText.parse(created.data._id);
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
  details: JsonObject = {},
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

async function realSend(api: Client, id: string, to: string[]) {
  const sent = await api.post(`${TEMPLATES}/${id}/send`, { to });
  expect(sent.status, JSON.stringify(sent.data)).to.equal(HTTP_OK);
  return sentResultsSchema.parse(sent.data.results);
}

async function entryOf(
  api: Client,
  email: string,
): Promise<SuppressionRow | undefined> {
  const list = await api.get(
    `${SUPPRESSIONS_TABLE}/list?limit=50&search=${encodeURIComponent(email)}`,
  );
  expect(list.status, JSON.stringify(list.data)).to.equal(HTTP_OK);
  return z
    .array(suppressionRowSchema)
    .parse(list.data.results)
    .find((row) => row.email === email);
}

describe("[integration] suppression list", () => {
  it("suppresses a spam complaint and logs the next send as suppressed", async () => {
    const { api } = await client();
    const id = await liveTemplate(api, "suppress-spam");
    const [first] = await realSend(api, id, ["complaint@example.test"]);
    await markEvent(api, first!.sendId, "spam");

    const entry = await entryOf(api, "complaint@example.test");
    expect(entry).to.deep.include({
      reason: "complaint",
      sendId: first!.sendId,
    });

    const [second] = await realSend(api, id, ["Complaint@Example.test"]);
    expect(second!.status).to.equal("suppressed");
    expect(second!.error).to.equal("$dms_mailing.errors.suppressed.complaint");
    const detail = await api.get(`${SENDS}/${second!.sendId}`);
    expect(detail.data.send).to.deep.include({
      status: "suppressed",
      stage: "suppressed",
    });
    expect(detail.data.send.providerMessageId || "").to.equal("");
    expect(detail.data.suppression).to.deep.include({
      email: "complaint@example.test",
      reason: "complaint",
    });
  });

  it("sends to the other recipients and keeps their order", async () => {
    const { api } = await client();
    const id = await liveTemplate(api, "suppress-mixed");
    const [first] = await realSend(api, id, ["gone@example.test"]);
    await markEvent(api, first!.sendId, "bounced", {
      reason: "550 5.1.1 No such user",
    });
    const results = await realSend(api, id, [
      "kept@example.test",
      "gone@example.test",
    ]);
    expect(results).to.have.length(2);
    expect(results[0]!.status).to.not.equal("suppressed");
    expect(results[1]!.status).to.equal("suppressed");
    const entry = await entryOf(api, "gone@example.test");
    expect(entry?.reason).to.equal("hard_bounce");
  });

  it("leaves a temporary bounce and a test's spam report off the list", async () => {
    const { api } = await client();
    const id = await liveTemplate(api, "suppress-soft");
    const [real] = await realSend(api, id, ["soft@example.test"]);
    await markEvent(api, real!.sendId, "bounced", {
      reason: "452 4.2.2 Mailbox full",
    });
    expect(await entryOf(api, "soft@example.test")).to.equal(undefined);

    const test = await api.post(`${TEMPLATES}/${id}/test-send`, {
      to: ["tester@example.test"],
      locale: "en",
    });
    expect(test.status, JSON.stringify(test.data)).to.equal(HTTP_OK);
    await markEvent(api, test.data.results[0].sendId, "spam");
    expect(await entryOf(api, "tester@example.test")).to.equal(undefined);
  });

  it("adds an address by hand, refuses it twice and lifts it", async () => {
    const { api } = await client();
    const id = await liveTemplate(api, "suppress-manual");
    const invalid = await api.post(SUPPRESSIONS, { email: "nope" });
    expect(invalid.status).to.equal(HTTP_BAD_REQUEST);

    const added = await api.post(SUPPRESSIONS, {
      email: " Manual@Example.test ",
      note: "Asked by phone",
    });
    expect(added.status, JSON.stringify(added.data)).to.equal(HTTP_OK);
    const twice = await api.post(SUPPRESSIONS, {
      email: "manual@example.test",
    });
    expect(twice.status).to.equal(HTTP_CONFLICT);
    expect(JSON.stringify(twice.data)).to.contain("already");

    const entry = await entryOf(api, "manual@example.test");
    expect(entry).to.deep.include({ reason: "manual", sendId: "" });
    const [blocked] = await realSend(api, id, ["manual@example.test"]);
    expect(blocked!.status).to.equal("suppressed");

    const lifted = await api.delete(`${SUPPRESSIONS}/${entry!._id}`);
    expect(lifted.status, JSON.stringify(lifted.data)).to.equal(HTTP_OK);
    const gone = await api.delete(`${SUPPRESSIONS}/${entry!._id}`);
    expect(gone.status).to.equal(HTTP_NOT_FOUND);
    const [sent] = await realSend(api, id, ["manual@example.test"]);
    expect(sent!.status).to.not.equal("suppressed");
  });

  it("filters the list on one address, as the send drawer links to it", async () => {
    const { api } = await client();
    const emails = ["filter-a@example.test", "filter-b@example.test"];
    for (const email of emails) await api.post(SUPPRESSIONS, { email });
    const list = await api.get(
      `${SUPPRESSIONS_TABLE}/list?limit=50&filter_email=${encodeURIComponent(`is:${emails[0]}`)}`,
    );
    expect(list.status, JSON.stringify(list.data)).to.equal(HTTP_OK);
    const rows = z.array(suppressionRowSchema).parse(list.data.results);
    expect(rows.map((row) => row.email)).to.deep.equal([emails[0]]);
    for (const email of emails) {
      const entry = await entryOf(api, email);
      await api.delete(`${SUPPRESSIONS}/${entry!._id}`);
    }
  });

  it("lets a test reach the editor's own suppressed address, and says so", async () => {
    const { api, email } = await client();
    const id = await liveTemplate(api, "suppress-own");
    await api.post(SUPPRESSIONS, { email });
    const test = await api.post(`${TEMPLATES}/${id}/test-send`, {
      to: [email],
      locale: "en",
    });
    expect(test.status, JSON.stringify(test.data)).to.equal(HTTP_OK);
    expect(test.data.results[0].status).to.not.equal("suppressed");
    expect(test.data.ownAddressSuppressed).to.deep.include({
      email,
      reason: "manual",
    });
    const entry = await entryOf(api, email);
    await api.delete(`${SUPPRESSIONS}/${entry!._id}`);
  });
});
