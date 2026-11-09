import { expect } from "chai";
import { webhookSecretOutcome } from "../../services/webhook-secret-declaration";
import type { WebhookSecretSource } from "../../types";

const STORED = "s".repeat(48);
const DECLARED = "d".repeat(48);

const stored = (webhookSecretSource: WebhookSecretSource) => ({
  webhookSecret: STORED,
  webhookSecretSource,
});

describe("[unit] webhook secret declaration outcome", () => {
  it("answers unchanged for the stored secret, whoever set it", () => {
    for (const source of ["generated", "declared", "operator"] as const)
      expect(webhookSecretOutcome(stored(source), STORED, false)).to.equal(
        "unchanged",
      );
  });

  it("replaces a generated or declared secret", () => {
    expect(webhookSecretOutcome(stored("generated"), DECLARED, false)).to.equal(
      "set",
    );
    expect(webhookSecretOutcome(stored("declared"), DECLARED, false)).to.equal(
      "set",
    );
  });

  it("keeps the workspace owner's secret unless asked to replace it", () => {
    expect(webhookSecretOutcome(stored("operator"), DECLARED, false)).to.equal(
      "kept",
    );
    expect(webhookSecretOutcome(stored("operator"), DECLARED, true)).to.equal(
      "set",
    );
  });
});
