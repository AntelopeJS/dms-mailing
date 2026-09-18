import type { BatchEmailMessageResponse } from "@antelopejs/interface-email";
import { expect } from "chai";
import { matchBatchResponses } from "../../services/send";

const BATCH_LATENCY_MS = 12;
const PER_MESSAGE_LATENCY_MS = 6;
const QUARTER_LATENCY_MS = 3;

const response = (
  index: number,
  overrides: Partial<BatchEmailMessageResponse> = {},
): BatchEmailMessageResponse => ({
  index,
  recipient: `r${index}@test.local`,
  success: true,
  status: "sent",
  messageId: `m${index}`,
  ...overrides,
});

describe("[unit] services/send batch matching", () => {
  it("pairs every recipient with the response carrying its index", () => {
    const delivered = matchBatchResponses(
      ["a@test.local", "b@test.local"],
      [response(1), response(0)],
      BATCH_LATENCY_MS,
    );
    expect(delivered.map((message) => message.to)).to.deep.equal([
      "a@test.local",
      "b@test.local",
    ]);
    expect(
      delivered.map((message) => message.outcome.providerMessageId),
    ).to.deep.equal(["m0", "m1"]);
    expect(delivered.every((message) => message.status === "sent")).to.equal(
      true,
    );
  });

  it("fails the recipients the provider left out or rejected", () => {
    const delivered = matchBatchResponses(
      ["a@test.local", "b@test.local"],
      [
        response(0, {
          success: false,
          status: "failed",
          error: { code: "rejected", message: "Mailbox unavailable" },
        }),
      ],
      BATCH_LATENCY_MS,
    );
    expect(delivered[0]?.status).to.equal("failed");
    expect(delivered[0]?.outcome.error).to.equal("Mailbox unavailable");
    expect(delivered[1]?.status).to.equal("failed");
    expect(delivered[1]?.outcome.latencyMs).to.equal(PER_MESSAGE_LATENCY_MS);
  });

  it("splits the batch wall-clock over the messages it covered", () => {
    const recipients = ["a", "b", "c", "d"].map((id) => `${id}@test.local`);
    const responses = recipients.map((_to, index) => response(index));

    const delivered = matchBatchResponses(
      recipients,
      responses,
      BATCH_LATENCY_MS,
    );

    expect(delivered.map((message) => message.outcome.latencyMs)).to.deep.equal(
      recipients.map(() => QUARTER_LATENCY_MS),
    );
  });
});
