import { expect } from "chai";
import { applyEvent } from "../../services/events";

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
