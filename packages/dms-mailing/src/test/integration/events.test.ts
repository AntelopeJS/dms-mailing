import { expect } from "chai";
import {
  clearEmailEventSubscriptions,
  emailEventTrigger,
} from "../../automation/email-event-trigger";
import { authorizedClient, createClient, eventsPath } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";
import { checkedText } from "../helpers/checked";

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const SECRET_LENGTH = 48;
const TABLE = "/api/mailing/tables/templates";

interface EventRow {
  type: string;
}

describe("[integration] events", () => {
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
      { headers: { "x-mailing-webhook-secret": settings.data.webhookSecret } },
    );
    expect(hook.status, JSON.stringify(hook.data)).to.equal(HTTP_OK);
    expect(hook.data.recorded).to.equal(true);

    const after = await client.get(`/api/mailing/sends/${sendId}`);
    expect(after.data.send.status).to.equal("opened");
    expect(after.data.send.opens).to.equal(1);
    expect(after.data.events.map((event: EventRow) => event.type)).to.include(
      "opened",
    );

    const rejected = await client.post(eventsPath("manual"), {
      messageId,
      type: "opened",
    });
    expect(rejected.status).to.equal(HTTP_FORBIDDEN);
  });

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
          headers: { "x-mailing-webhook-secret": settings.data.webhookSecret },
        },
      );
      expect(hook.status, JSON.stringify(hook.data)).to.equal(HTTP_OK);
      expect(hook.data.recorded).to.equal(true);
    } finally {
      clearEmailEventSubscriptions();
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
      messageId: detail.data.send.providerMessageId,
      type: "opened",
      details: { eventId: "evt-retried-1" },
    };
    const headers = {
      headers: { "x-mailing-webhook-secret": settings.data.webhookSecret },
    };

    const first = await client.post(eventsPath("manual"), body, headers);
    const retry = await client.post(eventsPath("manual"), body, headers);

    expect(first.data.recorded).to.equal(true);
    expect(retry.status).to.equal(HTTP_OK);
    expect(retry.data.recorded).to.equal(false);
    const after = await client.get(`/api/mailing/sends/${sendId}`);
    expect(after.data.send.opens).to.equal(1);
    const opened = after.data.events.filter(
      (event: EventRow) => event.type === "opened",
    );
    expect(opened).to.have.length(1);
  });
});

describe("[integration] webhook for a tenant without settings", () => {
  /**
   * The endpoint is unauthenticated and takes the tenant from the URL: reading
   * the secret must not create a settings row for whatever tenant id it names.
   */
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
  /**
   * The retention cron deletes a send's events in one filtered statement. A
   * wrong predicate there would take another send's history with it, so pin
   * that it removes exactly one send's rows.
   */
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
