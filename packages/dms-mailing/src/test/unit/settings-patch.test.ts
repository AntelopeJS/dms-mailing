import { expect } from "chai";
import {
  mergeSettingsPatch,
  missingVariablesPolicy,
} from "../../services/settings";
import { DEFAULT_CATEGORIES, type MailingSettingsValues } from "../../types";

const CURRENT: MailingSettingsValues = {
  fallbackLocale: "en",
  logRetentionDays: 90,
  blockOnMissingVariables: false,
  senderName: "Acme",
  senderEmail: "hello@acme.test",
  replyTo: "",
  webhookSecret: "s".repeat(48),
  categories: DEFAULT_CATEGORIES,
};

describe("[unit] services/settings mergeSettingsPatch", () => {
  it("keeps every field the form did not send", () => {
    const merged = mergeSettingsPatch(CURRENT, { senderName: "Acme Supplies" });
    expect(merged).to.deep.equal({ ...CURRENT, senderName: "Acme Supplies" });
  });

  it("turns a cleared field into an empty string", () => {
    const merged = mergeSettingsPatch(CURRENT, { replyTo: null });
    expect(merged.replyTo).to.equal("");
  });

  it("drops the read-only derived fields", () => {
    const merged = mergeSettingsPatch(CURRENT, {
      webhookUrl: "https://x",
      provider: "Brevo",
    });
    expect(merged).to.deep.equal(CURRENT);
  });

  it("folds the missing-variables choice into its boolean", () => {
    expect(
      mergeSettingsPatch(CURRENT, { missingVariables: "refuse" })
        .blockOnMissingVariables,
    ).to.equal(true);
    expect(
      mergeSettingsPatch(
        { ...CURRENT, blockOnMissingVariables: true },
        { missingVariables: "send" },
      ).blockOnMissingVariables,
    ).to.equal(false);
  });

  it("lets an explicit boolean win over the derived choice", () => {
    const merged = mergeSettingsPatch(CURRENT, {
      missingVariables: "send",
      blockOnMissingVariables: true,
    });
    expect(merged.blockOnMissingVariables).to.equal(true);
  });

  it("reads the boolean back as the two choices", () => {
    expect(missingVariablesPolicy(CURRENT)).to.equal("send");
    expect(
      missingVariablesPolicy({ ...CURRENT, blockOnMissingVariables: true }),
    ).to.equal("refuse");
  });
});
