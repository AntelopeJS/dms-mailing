import { expect } from "chai";
import { z } from "zod";
import {
  type EmailEventPayload,
  emailEventTrigger,
} from "../../automation/email-event-trigger";
import { clearTriggerSubscriptions } from "../../automation/emitter";
import { capture } from "../helpers/automation";
import { authorizedClient, createClient, eventsPath } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";
import { checkedText, parsedBody } from "../helpers/checked";

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const SECRET_LENGTH = 48;
const TABLE = "/api/mailing/tables/templates";

const eventsBodySchema = z.object({
  events: z.array(z.object({ type: z.string() })),
});

describe("[integration] events recording", () => {
  it("records a webhook event against the send that carries the provider message id", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const settings = await client.get("/api/mailing/settings");
    const created = await client.post(`${TABLE}/new`, {
      slug: "event-target",
      name: "Event target",
      category: "orders",
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    const sent = await client.post(
      `/api/mailing/templates/${created.data._id}/test-send`,
      { to: ["events@example.test"], locale: "en", data: {} },
    );
    expect(sent.status, JSON.stringify(sent.data)).to.equal(HTTP_OK);
    const sendId = checkedText.parse(sent.data.results[0].sendId);

    const detail = await client.get(`/api/mailing/sends/${sendId}`);
    const messageId = checkedText.parse(detail.data.send.providerMessageId);
    expect(messageId, "provider message id").to.be.a("string");
    expect(messageId.length, "provider message id").to.be.greaterThan(0);

    const hook = await client.post(
      eventsPath("manual"),
      { messageId, type: "opened", details: { userAgent: "test" } },
      {
        headers: {
          "x-mailing-webhook-secret": checkedText.parse(
            settings.data.webhookSecret,
          ),
        },
      },
    );
    expect(hook.status, JSON.stringify(hook.data)).to.equal(HTTP_OK);
    expect(hook.data.recorded).to.equal(true);

    const after = await client.get(`/api/mailing/sends/${sendId}`);
    expect(after.data.send.status).to.equal("opened");
    expect(after.data.send.opens).to.equal(1);
    expect(
      parsedBody(after, eventsBodySchema).events.map((event) => event.type),
    ).to.include("opened");

    const rejected = await client.post(eventsPath("manual"), {
      messageId,
      type: "opened",
    });
    expect(rejected.status).to.equal(HTTP_FORBIDDEN);
  });
});

describe("[integration] events resilience", () => {
  it("records the event even when an automation subscription throws", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const settings = await client.get("/api/mailing/settings");
    const created = await client.post(`${TABLE}/new`, {
      slug: "throwing-subscriber",
      name: "Throwing subscriber",
      category: "orders",
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    const sent = await client.post(
      `/api/mailing/templates/${created.data._id}/test-send`,
      { to: ["throwing@example.test"], locale: "en", data: {} },
    );
    expect(sent.status, JSON.stringify(sent.data)).to.equal(HTTP_OK);
    const sendId = checkedText.parse(sent.data.results[0].sendId);
    const detail = await client.get(`/api/mailing/sends/${sendId}`);
    const messageId = checkedText.parse(detail.data.send.providerMessageId);

    await emailEventTrigger.activate({}, () => {
      throw new Error("subscriber exploded");
    });
    try {
      const hook = await client.post(
        eventsPath("manual"),
        { messageId, type: "delivered" },
        {
          headers: {
            "x-mailing-webhook-secret": checkedText.parse(
              settings.data.webhookSecret,
            ),
          },
        },
      );
      expect(hook.status, JSON.stringify(hook.data)).to.equal(HTTP_OK);
      expect(hook.data.recorded).to.equal(true);
    } finally {
      clearTriggerSubscriptions();
    }

    const after = await client.get(`/api/mailing/sends/${sendId}`);
    expect(after.data.send.status).to.equal("delivered");
  });

  it("ignores a webhook the provider delivers twice", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const settings = await client.get("/api/mailing/settings");
    const created = await client.post(`${TABLE}/new`, {
      slug: "retried-webhook",
      name: "Retried webhook",
      category: "orders",
    });
    const sent = await client.post(
      `/api/mailing/templates/${created.data._id}/test-send`,
      { to: ["retried@example.test"], locale: "en", data: {} },
    );
    const sendId = checkedText.parse(sent.data.results[0].sendId);
    const detail = await client.get(`/api/mailing/sends/${sendId}`);
    const body = {
      messageId: checkedText.parse(detail.data.send.providerMessageId),
      type: "opened",
      details: { eventId: "evt-retried-1" },
    };
    const headers = {
      headers: {
        "x-mailing-webhook-secret": checkedText.parse(
          settings.data.webhookSecret,
        ),
      },
    };

    const first = await client.post(eventsPath("manual"), body, headers);
    const retry = await client.post(eventsPath("manual"), body, headers);

    expect(first.data.recorded).to.equal(true);
    expect(retry.status).to.equal(HTTP_OK);
    expect(retry.data.recorded).to.equal(false);
    const after = await client.get(`/api/mailing/sends/${sendId}`);
    expect(after.data.send.opens).to.equal(1);
    const opened = parsedBody(after, eventsBodySchema).events.filter(
      (event) => event.type === "opened",
    );
    expect(opened).to.have.length(1);
  });
});

/** A provider event as the manual webhook takes it. */
type WebhookBody = {
  messageId: string;
  type: string;
  at?: string;
  details?: Record<string, string>;
};

describe("[integration] e-mail event trigger on test sends", () => {
  afterEach(() => {
    clearTriggerSubscriptions();
  });

  async function testSendWithMessageId(slug: string) {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const settings = await client.get("/api/mailing/settings");
    const created = await client.post(`${TABLE}/new`, {
      slug,
      name: slug,
      category: "orders",
    });
    const sent = await client.post(
      `/api/mailing/templates/${created.data._id}/test-send`,
      { to: [`${slug}@example.test`], locale: "en", data: {} },
    );
    const sendId = checkedText.parse(sent.data.results[0].sendId);
    const detail = await client.get(`/api/mailing/sends/${sendId}`);
    const post = (body: WebhookBody) =>
      client.post(eventsPath("manual"), body, {
        headers: {
          "x-mailing-webhook-secret": checkedText.parse(
            settings.data.webhookSecret,
          ),
        },
      });
    return {
      sendId,
      messageId: checkedText.parse(detail.data.send.providerMessageId),
      post,
    };
  }

  it("marks a test send's event and fires it only where tests are taken", async () => {
    const saved = await capture(emailEventTrigger, {});
    const opted = await capture(emailEventTrigger, { includeTests: true });
    const { sendId, messageId, post } =
      await testSendWithMessageId("event-is-test");

    const hook = await post({
      messageId,
      type: "opened",
      details: { eventId: "evt-is-test-1" },
    });

    expect(hook.data.recorded).to.equal(true);
    expect(saved.received).to.deep.equal([]);
    const [payload] = opted.received;
    expect(opted.received).to.have.length(1);
    expect(payload).to.deep.include({
      tenantId: "default",
      sendId,
      type: "opened",
      isTest: true,
      deliveryId: `${sendId}:evt-is-test-1`,
      source: "dms-mailing:test-send",
    });
    expect(Number.isNaN(Date.parse(payload.at))).to.equal(false);
  });

  it("gives the same key to two events of one provider event id, and another to a new one", async () => {
    const { sendId, messageId, post } =
      await testSendWithMessageId("event-delivery-id");
    const received: EmailEventPayload[] = [];
    await emailEventTrigger.activate({ includeTests: true }, (payload) => {
      received.push(payload);
    });
    const at = "2026-11-01T10:00:00.000Z";

    await post({ messageId, type: "clicked", details: { eventId: "evt-a" } });
    await post({ messageId, type: "opened", at, details: { ua: "x" } });

    expect(received[0].deliveryId).to.equal(`${sendId}:evt-a`);
    expect(received[1].deliveryId).to.match(
      new RegExp(`^${sendId}:[0-9a-f]{64}$`),
    );
    const { eventDeliveryId } = await import("../../services/events");
    expect(
      eventDeliveryId(
        sendId,
        { type: "opened", details: { ua: "x" } },
        new Date(at),
      ),
    ).to.equal(received[1].deliveryId);
  });
});

describe("[integration] webhook for a tenant without settings", () => {
  it("refuses the event and stores nothing", async () => {
    const { GetModel } =
      await import("@antelopejs/interface-database-decorators");
    const { SettingsModel } = await import("../../db");
    const tenantId = `unknown-tenant-${Date.now()}`;

    const hook = await createClient().post(
      `/api/mailing/events/manual/${tenantId}`,
      { messageId: "unknown-message", type: "opened" },
      { headers: { "x-mailing-webhook-secret": "a".repeat(SECRET_LENGTH) } },
    );

    expect(hook.status).to.equal(HTTP_FORBIDDEN);
    expect(await GetModel(SettingsModel, tenantId).getAll()).to.have.lengthOf(
      0,
    );
  });
});

describe("[integration] send event purge", () => {
  it("deletes only the events of the send it targets", async () => {
    const { GetModel } =
      await import("@antelopejs/interface-database-decorators");
    const { DEFAULT_TENANT_ID } =
      await import("@antelopejs/interface-dms/constants");
    const { SendEventModel } = await import("../../db");
    const events = GetModel(SendEventModel, DEFAULT_TENANT_ID);

    const kept = `keep-${Date.now()}`;
    const purged = `purge-${Date.now()}`;
    await events.insert({
      sendId: purged,
      type: "delivered",
      at: new Date(),
      json_details: "{}",
    });
    await events.insert({
      sendId: kept,
      type: "opened",
      at: new Date(),
      json_details: "{}",
    });

    const removed = await events.deleteBySend(purged);

    expect(removed).to.equal(1);
    expect(await events.getBySend(purged)).to.have.lengthOf(0);
    expect(await events.getBySend(kept)).to.have.lengthOf(1);
  });
});
