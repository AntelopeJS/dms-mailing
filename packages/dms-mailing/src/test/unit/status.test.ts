import { expect } from "chai";
import { toSendStatus } from "../../services/status";

describe("[unit] services/status", () => {
  it("maps provider statuses onto send statuses", () => {
    expect(toSendStatus("queued")).to.equal("queued");
    expect(toSendStatus("sent")).to.equal("sent");
    expect(toSendStatus("delivered")).to.equal("delivered");
    expect(toSendStatus("rejected")).to.equal("bounced");
    expect(toSendStatus("scheduled")).to.equal("queued");
    expect(toSendStatus("failed")).to.equal("failed");
    expect(toSendStatus("unknown")).to.equal("sent");
  });
});
