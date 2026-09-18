import { expect } from "chai";
import { webhookSecretMatches } from "../../services/events";
import { settingsSchema } from "../../validation/settings.schema";

const VALID_SECRET = "a".repeat(48);

const settings = (webhookSecret: string) => ({
  fallbackLocale: "en",
  logRetentionDays: 30,
  blockOnMissingVariables: false,
  senderName: "",
  senderEmail: "",
  replyTo: "",
  webhookSecret,
  categories: [],
});

describe("[unit] webhook secret", () => {
  // The event endpoint is the module's only unauthenticated route: the secret
  // is the whole gate, so an absent or blank one must close it, not open it.
  it("refuses every request when no secret is stored", () => {
    expect(webhookSecretMatches("", "")).to.equal(false);
    expect(webhookSecretMatches(undefined, "")).to.equal(false);
    expect(webhookSecretMatches(VALID_SECRET, "")).to.equal(false);
  });

  it("refuses a missing or wrong header against a real secret", () => {
    expect(webhookSecretMatches(undefined, VALID_SECRET)).to.equal(false);
    expect(webhookSecretMatches("", VALID_SECRET)).to.equal(false);
    expect(webhookSecretMatches("b".repeat(48), VALID_SECRET)).to.equal(false);
    expect(webhookSecretMatches("a".repeat(47), VALID_SECRET)).to.equal(false);
  });

  it("accepts the exact secret", () => {
    expect(webhookSecretMatches(VALID_SECRET, VALID_SECRET)).to.equal(true);
  });
});

describe("[unit] settings validation", () => {
  it("refuses to store a blank webhook secret", () => {
    expect(() => settingsSchema.parse(settings(""))).to.throw();
    expect(() => settingsSchema.parse(settings("short"))).to.throw();
  });

  it("accepts a secret long enough to be worth guessing", () => {
    expect(settingsSchema.parse(settings(VALID_SECRET)).webhookSecret).to.equal(
      VALID_SECRET,
    );
  });
});
