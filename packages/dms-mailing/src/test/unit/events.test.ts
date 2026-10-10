import { expect } from "chai";
import { applyEvent, problemReason } from "../../services/events";
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
