import { expect } from "chai";
import { unregisterAutomationNodes } from "../../automation";
import {
  clearEmailEventSubscriptions,
  type EmailEventPayload,
  emailEventTrigger,
  emitEmailEvent,
} from "../../automation/email-event-trigger";
import { sendTemplateAction } from "../../automation/send-template-action";

const EVENT: EmailEventPayload = {
  tenantId: "t",
  sendId: "s",
  templateSlug: "x",
  type: "bounced",
  recipientEmail: "a@b",
};

describe("[unit] automation nodes", () => {
  afterEach(() => {
    clearEmailEventSubscriptions();
  });

  it("describes the send-template action", () => {
    expect(sendTemplateAction.id).to.equal("mailing.send-template");
    expect(sendTemplateAction.inputSchema).to.deep.include({
      required: ["tenantId", "slug", "to"],
    });
  });

  // The automation module ships no loop node: a procedure cannot call this
  // action once per contact, so the fan-out has to happen inside it. The port
  // must therefore accept a list, which `sendTemplate` already handles.
  it("accepts a list of recipients on the `to` port, not just one address", () => {
    const properties = (
      sendTemplateAction.inputSchema as {
        properties: Record<string, { type?: unknown; items?: unknown }>;
      }
    ).properties;
    const to = properties.to as { type?: unknown; items?: unknown };
    expect(to.type).to.deep.equal(["string", "array"]);
    expect(to.items).to.deep.equal({ type: "string" });
  });

  it("fans e-mail events out to active trigger subscriptions filtered by type", async () => {
    const received: unknown[] = [];
    const handle = await emailEventTrigger.activate(
      { types: ["bounced"] },
      (payload) => {
        received.push(payload);
      },
    );
    emitEmailEvent({
      tenantId: "t",
      sendId: "s",
      templateSlug: "x",
      type: "opened",
      recipientEmail: "a@b",
    });
    emitEmailEvent({
      tenantId: "t",
      sendId: "s",
      templateSlug: "x",
      type: "bounced",
      recipientEmail: "a@b",
    });
    await emailEventTrigger.deactivate(handle);
    emitEmailEvent({
      tenantId: "t",
      sendId: "s",
      templateSlug: "x",
      type: "bounced",
      recipientEmail: "a@b",
    });
    expect(received).to.have.length(1);
  });

  it("fans every event out to a subscription that filters no type", async () => {
    const received: unknown[] = [];
    const handle = await emailEventTrigger.activate({}, (payload) => {
      received.push(payload);
    });
    emitEmailEvent({
      tenantId: "t",
      sendId: "s",
      templateSlug: "x",
      type: "opened",
      recipientEmail: "a@b",
    });
    await emailEventTrigger.deactivate(handle);
    expect(received).to.have.length(1);
  });

  it("keeps fanning out when a subscription throws", async () => {
    const received: EmailEventPayload[] = [];
    await emailEventTrigger.activate({}, () => {
      throw new Error("subscriber exploded");
    });
    await emailEventTrigger.activate({}, (payload) => {
      received.push(payload);
    });

    expect(() => emitEmailEvent(EVENT)).to.not.throw();
    expect(received).to.deep.equal([EVENT]);
  });

  it("stops fanning out once the subscriptions are cleared", async () => {
    const received: EmailEventPayload[] = [];
    await emailEventTrigger.activate({}, (payload) => {
      received.push(payload);
    });

    clearEmailEventSubscriptions();
    emitEmailEvent(EVENT);

    expect(received).to.have.length(0);
  });

  it("clears the subscriptions when the node types are unregistered", async () => {
    const received: EmailEventPayload[] = [];
    await emailEventTrigger.activate({}, (payload) => {
      received.push(payload);
    });

    unregisterAutomationNodes();
    emitEmailEvent(EVENT);

    expect(received).to.have.length(0);
  });
});
