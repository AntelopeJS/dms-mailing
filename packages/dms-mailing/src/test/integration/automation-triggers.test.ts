import { expect } from "chai";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { addressSuppressedTrigger } from "../../automation/address-suppressed-trigger";
import { addressUnsuppressedTrigger } from "../../automation/address-unsuppressed-trigger";
import { clearTriggerSubscriptions } from "../../automation/emitter";
import { templatePublishedTrigger } from "../../automation/template-published-trigger";
import { templateStatusChangedTrigger } from "../../automation/template-status-changed-trigger";
import { SuppressionModel, suppressionIdOf } from "../../db";
import { capture } from "../helpers/automation";
import { checkedNumber, checkedText } from "../helpers/checked";
import { declaration, mailing } from "../helpers/declarations";
import { authorizedClient, eventsPath } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const TABLE = "/api/mailing/tables/templates";
const TEMPLATES = "/api/mailing/templates";
const SENDS = "/api/mailing/sends";
const SUPPRESSIONS = "/api/mailing/suppressions";

type Client = ReturnType<typeof authorizedClient>;

async function api(): Promise<Client> {
  const session = await ensureOwnerSession();
  return authorizedClient(session.accessToken);
}

async function draftTemplate(client: Client, slug: string): Promise<string> {
  const created = await client.post(`${TABLE}/new`, {
    slug,
    name: slug,
    category: "orders",
  });
  expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
  const id = checkedText.parse(created.data._id);
  await saveSubject(client, id, "First");
  return id;
}

async function saveSubject(client: Client, id: string, subject: string) {
  const saved = await client.post(`${TEMPLATES}/${id}/content`, {
    content: { locales: { en: { subject, preheader: "", blocks: [] } } },
  });
  expect(saved.status, JSON.stringify(saved.data)).to.equal(HTTP_OK);
  return checkedNumber.parse(saved.data.revision);
}

async function realSend(client: Client, id: string, to: string) {
  const sent = await client.post(`${TEMPLATES}/${id}/send`, { to: [to] });
  expect(sent.status, JSON.stringify(sent.data)).to.equal(HTTP_OK);
  return checkedText.parse(sent.data.results[0].sendId);
}

async function markEvent(client: Client, sendId: string, type: string) {
  const settings = await client.get("/api/mailing/settings");
  const detail = await client.get(`${SENDS}/${sendId}`);
  const hook = await client.post(
    eventsPath("manual"),
    {
      messageId: checkedText.parse(detail.data.send.providerMessageId),
      type,
      details: { reason: "Reported as spam" },
    },
    {
      headers: {
        "x-mailing-webhook-secret": checkedText.parse(
          settings.data.webhookSecret,
        ),
      },
    },
  );
  expect(hook.status, JSON.stringify(hook.data)).to.equal(HTTP_OK);
}

const entryOf = (email: string) =>
  GetModel(SuppressionModel, DEFAULT_TENANT_ID).findByEmail(email);

describe("[integration] address-suppressed trigger", () => {
  afterEach(() => {
    clearTriggerSubscriptions();
  });

  it("fires once for a spam complaint, with the send and no author", async () => {
    const client = await api();
    const id = await draftTemplate(client, "trigger-spam");
    await client.post(`${TEMPLATES}/${id}/publish`, {});
    const { received } = await capture(addressSuppressedTrigger, {});
    const first = await realSend(client, id, "trigger-spam@example.test");

    await markEvent(client, first, "spam");
    await markEvent(client, first, "spam");

    expect(received, "a second complaint for a listed address").to.have.length(
      1,
    );
    const [spam] = received;
    expect(spam).to.deep.include({
      email: "trigger-spam@example.test",
      tenantId: DEFAULT_TENANT_ID,
      suppressionId: suppressionIdOf("trigger-spam@example.test"),
      reason: "complaint",
      sendId: first,
      detail: "Reported as spam",
      createdBy: "",
    });
    expect(spam?.originProcedureId).to.equal(undefined);
    expect(spam?.deliveryId).to.equal(
      `${spam?.suppressionId}:${Date.parse(spam?.createdAt ?? "")}`,
    );
  });

  it("fires for a manual entry with its author, and not for a test's spam report", async () => {
    const client = await api();
    const id = await draftTemplate(client, "trigger-manual");
    await client.post(`${TEMPLATES}/${id}/publish`, {});
    const { received } = await capture(addressSuppressedTrigger, {});

    const added = await client.post(SUPPRESSIONS, {
      email: "Trigger-Manual@example.test",
      note: "Asked by phone",
    });
    const test = await client.post(`${TEMPLATES}/${id}/test-send`, {
      to: ["trigger-tester@example.test"],
      locale: "en",
    });
    await markEvent(
      client,
      checkedText.parse(test.data.results[0].sendId),
      "spam",
    );

    expect(added.status, JSON.stringify(added.data)).to.equal(HTTP_OK);
    const row = await entryOf("trigger-manual@example.test");
    expect(received).to.have.length(1);
    expect(received[0]).to.deep.include({
      email: "trigger-manual@example.test",
      reason: "manual",
      sendId: "",
      detail: "Asked by phone",
      createdBy: row?.createdBy,
    });
    expect(row?.createdBy).to.be.a("string").and.not.equal("");
  });
});

describe("[integration] address-unsuppressed trigger", () => {
  afterEach(() => {
    clearTriggerSubscriptions();
  });

  it("fires once when the dashboard lifts an entry, with the lifter", async () => {
    const client = await api();
    await client.post(SUPPRESSIONS, { email: "trigger-lift@example.test" });
    const row = await entryOf("trigger-lift@example.test");
    const { received } = await capture(addressUnsuppressedTrigger, {});

    const removals = await Promise.all([
      client.delete(`${SUPPRESSIONS}/${row?._id}`),
      client.delete(`${SUPPRESSIONS}/${row?._id}`),
    ]);
    const unknown = await client.delete(`${SUPPRESSIONS}/no-such-entry`);

    expect(
      removals.map((r) => r.status).toSorted((left, right) => left - right),
    ).to.deep.equal([HTTP_OK, HTTP_NOT_FOUND]);
    expect(unknown.status).to.equal(HTTP_NOT_FOUND);
    expect(received).to.have.length(1);
    expect(received[0]).to.deep.include({
      tenantId: DEFAULT_TENANT_ID,
      suppressionId: row?._id,
      email: "trigger-lift@example.test",
      reason: "manual",
      sendId: "",
      removedBy: row?.createdBy,
      suppressedAt: row?.createdAt.toISOString(),
      deliveryId: `${row?._id}:${row?.createdAt.getTime()}:removed`,
    });
  });

  it("tells a lifted complaint's reason and send", async () => {
    const client = await api();
    const id = await draftTemplate(client, "trigger-lift-spam");
    await client.post(`${TEMPLATES}/${id}/publish`, {});
    const sendId = await realSend(client, id, "lift-spam@example.test");
    await markEvent(client, sendId, "spam");
    const { received } = await capture(addressUnsuppressedTrigger, {
      reasons: ["complaint"],
    });

    await client.delete(
      `${SUPPRESSIONS}/${suppressionIdOf("lift-spam@example.test")}`,
    );

    expect(received).to.have.length(1);
    expect(received[0]).to.deep.include({ reason: "complaint", sendId });
  });
});

describe("[integration] template-published trigger", () => {
  afterEach(() => {
    clearTriggerSubscriptions();
  });

  it("fires on the first publish, a new version and a publish that changes nothing", async () => {
    const client = await api();
    const id = await draftTemplate(client, "trigger-publish");
    const published = await capture(templatePublishedTrigger, {
      slugs: ["trigger-publish"],
    });
    const changed = await capture(templateStatusChangedTrigger, {
      slugs: ["trigger-publish"],
    });

    await client.post(`${TEMPLATES}/${id}/publish`, {});
    await saveSubject(client, id, "Second");
    await client.post(`${TEMPLATES}/${id}/publish`, {});
    await client.post(`${TEMPLATES}/${id}/publish`, {});

    expect(
      published.received.map((p) => ({
        version: p.version,
        previousVersion: p.previousVersion,
        isNewVersion: p.isNewVersion,
        previousStatus: p.previousStatus,
        origin: p.origin,
        locales: p.locales,
      })),
    ).to.deep.equal([
      {
        version: 1,
        previousVersion: 0,
        isNewVersion: true,
        previousStatus: "draft",
        origin: "editor",
        locales: ["en"],
      },
      {
        version: 2,
        previousVersion: 1,
        isNewVersion: true,
        previousStatus: "live",
        origin: "editor",
        locales: ["en"],
      },
      {
        version: 2,
        previousVersion: 2,
        isNewVersion: false,
        previousStatus: "live",
        origin: "editor",
        locales: ["en"],
      },
    ]);
    expect(new Set(published.received.map((p) => p.deliveryId)).size).to.equal(
      3,
    );
    expect(
      changed.received.map((p) => [p.previousStatus, p.status, p.action]),
    ).to.deep.equal([["draft", "live", "publish"]]);
  });

  it("fires nothing for a refused publish, and once for two racing ones", async () => {
    const client = await api();
    const id = await draftTemplate(client, "trigger-publish-race");
    const { received } = await capture(templatePublishedTrigger, {
      slugs: ["trigger-publish-race"],
    });

    const stale = await client.post(`${TEMPLATES}/${id}/publish`, {
      revision: 0,
    });
    const racing = await Promise.all([
      client.post(`${TEMPLATES}/${id}/publish`, {}),
      client.post(`${TEMPLATES}/${id}/publish`, {}),
    ]);

    expect(stale.status).to.equal(HTTP_CONFLICT);
    const applied = racing.filter((r) => r.status === HTTP_OK).length;
    expect(received, "one event per applied publish").to.have.length(applied);
    expect(
      received.filter((p) => p.previousVersion === 0),
      "the draft went live once",
    ).to.have.length(1);
  });

  it("tells a declared template only to a subscription that takes declarations", async () => {
    const { DeclareTemplate } = await mailing();
    const saved = await capture(templatePublishedTrigger, {});
    const opted = await capture(templatePublishedTrigger, {
      includeDeclared: true,
      slugs: ["trigger-declared"],
    });

    const created = await DeclareTemplate(declaration("trigger-declared"));
    const kept = await DeclareTemplate(declaration("trigger-declared"));

    expect([created.outcome, kept.outcome]).to.deep.equal(["created", "kept"]);
    expect(
      saved.received.filter((p) => p.slug === "trigger-declared"),
    ).to.deep.equal([]);
    expect(opted.received).to.have.length(1);
    expect(opted.received[0]).to.deep.include({
      templateId: created.templateId,
      version: 1,
      previousVersion: 0,
      previousStatus: "",
      origin: "declaration",
      publishedBy: "Release script",
      deliveryId: `${created.templateId}:declared`,
    });
    expect(opted.received[0].changeCount).to.be.greaterThan(0);
  });
});

describe("[integration] template-status-changed trigger", () => {
  afterEach(() => {
    clearTriggerSubscriptions();
  });

  it("fires once per unpublish, archive and restore, and nothing for a refused one", async () => {
    const client = await api();
    const id = await draftTemplate(client, "trigger-status");
    await client.post(`${TEMPLATES}/${id}/publish`, {});
    const { received } = await capture(templateStatusChangedTrigger, {
      slugs: ["trigger-status"],
    });

    const unpublished = await Promise.all([
      client.post(`${TEMPLATES}/${id}/unpublish`, {}),
      client.post(`${TEMPLATES}/${id}/unpublish`, {}),
    ]);
    await client.post(`${TEMPLATES}/${id}/archive`, {});
    const twice = await client.post(`${TEMPLATES}/${id}/archive`, {});
    await client.post(`${TEMPLATES}/${id}/restore`, {});

    expect(
      unpublished.map((r) => r.status).toSorted((left, right) => left - right),
    ).to.deep.equal([HTTP_OK, HTTP_CONFLICT]);
    expect(twice.status).to.equal(HTTP_CONFLICT);
    expect(
      received.map((p) => [
        p.previousStatus,
        p.status,
        p.action,
        p.publishedVersion,
      ]),
    ).to.deep.equal([
      ["live", "draft", "unpublish", 1],
      ["draft", "archived", "archive", 1],
      ["archived", "draft", "restore", 1],
    ]);
    const content = await client.get(`${TEMPLATES}/${id}/content`);
    expect(content.data.template.unpublishedAt).to.be.a("string");
  });
});
