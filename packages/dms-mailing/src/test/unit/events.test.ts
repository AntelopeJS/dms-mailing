import { expect } from "chai";
import type { JsonObject } from "../../types/json";
import type { MailingSendEvent } from "../../db";
import {
  applyEvent,
  errorAfter,
  isSameEvent,
  isSoftBounce,
  problemReason,
} from "../../services/events";
import type { SendEventType } from "../../types";

describe("[unit] services/events", () => {
  it("promotes the status forward only and counts opens/clicks", () => {
    expect(
      applyEvent({ status: "sent", opens: 0, clicks: 0 }, "opened"),
    ).to.deep.equal({ status: "opened", opens: 1, clicks: 0 });
    expect(
      applyEvent({ status: "clicked", opens: 1, clicks: 1 }, "opened"),
    ).to.deep.equal({ status: "clicked", opens: 2, clicks: 1 });
    expect(
      applyEvent({ status: "delivered", opens: 0, clicks: 0 }, "bounced"),
    ).to.deep.equal({ status: "bounced", opens: 0, clicks: 0 });
    expect(
      applyEvent({ status: "bounced", opens: 0, clicks: 0 }, "delivered"),
    ).to.deep.equal({ status: "bounced", opens: 0, clicks: 0 });
  });

  it("lets a later sign of delivery override a provider failure", () => {
    expect(
      applyEvent({ status: "failed", opens: 0, clicks: 0 }, "delivered"),
    ).to.deep.equal({ status: "delivered", opens: 0, clicks: 0 });
    expect(
      applyEvent({ status: "failed", opens: 0, clicks: 0 }, "opened"),
    ).to.deep.equal({ status: "opened", opens: 1, clicks: 0 });
    expect(
      applyEvent({ status: "failed", opens: 0, clicks: 0 }, "sent"),
    ).to.deep.equal({ status: "failed", opens: 0, clicks: 0 });
  });
});

describe("[unit] services/events delivery after a failure", () => {
  const event = (type: SendEventType, reason?: string) => ({
    provider: "smtp",
    messageId: "m1",
    type,
    details: reason ? { reason } : undefined,
  });

  it("clears the stored error once a failure turns out delivered", () => {
    expect(errorAfter(event("delivered"), "failed", "delivered")).to.equal("");
    expect(errorAfter(event("opened"), "delivered", "opened")).to.equal(
      undefined,
    );
    expect(errorAfter(event("failed", "421 4.3.0"), "sent", "failed")).to.equal(
      "421 4.3.0",
    );
  });
});

describe("[unit] services/events isSoftBounce", () => {
  const bounce = (details: JsonObject) => ({
    provider: "smtp",
    messageId: "m1",
    type: "bounced" as const,
    details,
  });

  it("reads the provider's bounce type first", () => {
    expect(isSoftBounce(bounce({ bounceType: "soft" }))).to.equal(true);
    expect(isSoftBounce(bounce({ bounceType: "Transient" }))).to.equal(true);
    expect(
      isSoftBounce(bounce({ bounceType: "hard", reason: "452 4.2.2" })),
    ).to.equal(false);
  });

  it("falls back on the SMTP answer's class", () => {
    expect(
      isSoftBounce(bounce({ reason: "452 4.2.2 The mailbox is full" })),
    ).to.equal(true);
    expect(isSoftBounce(bounce({ reason: "4.2.2 mailbox full" }))).to.equal(
      true,
    );
    expect(isSoftBounce(bounce({ reason: "550 5.1.1 No such user" }))).to.equal(
      false,
    );
    expect(isSoftBounce(bounce({}))).to.equal(false);
  });
});

describe("[unit] services/events isSameEvent", () => {
  const AT = new Date("2026-10-11T10:00:00.000Z");
  const stored = (
    type: SendEventType,
    details: JsonObject,
  ): MailingSendEvent => ({
    _id: "e1",
    sendId: "s1",
    type,
    at: AT,
    json_details: JSON.stringify(details),
  });
  const incoming = (type: SendEventType, details: JsonObject, at?: Date) => ({
    provider: "smtp",
    messageId: "m1",
    type,
    details,
    at,
  });

  it("matches a retried webhook on the provider's event id", () => {
    expect(
      isSameEvent(
        stored("delivered", { eventId: "ev-1" }),
        incoming("delivered", { eventId: "ev-1" }),
      ),
    ).to.equal(true);
    expect(
      isSameEvent(
        stored("opened", { eventId: "ev-1" }),
        incoming("opened", { eventId: "ev-2" }),
      ),
    ).to.equal(false);
  });

  it("matches on type, time and details without an event id", () => {
    expect(
      isSameEvent(
        stored("delivered", {}),
        incoming("delivered", {}, new Date(AT)),
      ),
    ).to.equal(true);
    expect(isSameEvent(stored("opened", {}), incoming("opened", {}))).to.equal(
      false,
    );
  });
});

describe("[unit] services/events problemReason", () => {
  const event = (type: SendEventType, reason?: string) => ({
    provider: "smtp",
    messageId: "m1",
    type,
    details: reason === undefined ? undefined : { reason },
  });

  it("keeps the provider's words for a problem event", () => {
    expect(problemReason(event("bounced", "550 5.1.1 No such user"))).to.equal(
      "550 5.1.1 No such user",
    );
  });

  it("ignores reasons on other events and blank reasons", () => {
    expect(problemReason(event("delivered", "ok"))).to.equal(undefined);
    expect(problemReason(event("failed", ""))).to.equal(undefined);
    expect(problemReason(event("spam"))).to.equal(undefined);
  });
});
