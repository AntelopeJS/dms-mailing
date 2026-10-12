import { expect } from "chai";
import {
  clearedToEmpty,
  mergeSettingsPatch,
  missingVariablesPolicy,
  settingsRevision,
} from "../../services/settings";
import { DEFAULT_CATEGORIES, type MailingSettingsValues } from "../../types";
import { settingsPatchSchema } from "../../validation/settings.schema";

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

describe("[unit] services/settings settingsRevision", () => {
  it("changes with any stored value and only then", () => {
    expect(settingsRevision(CURRENT)).to.equal(
      settingsRevision({ ...CURRENT }),
    );
    expect(settingsRevision(CURRENT)).to.not.equal(
      settingsRevision({ ...CURRENT, webhookSecret: "t".repeat(48) }),
    );
  });
});

describe("[unit] validation settingsPatchSchema", () => {
  const accepts = (patch: Record<string, unknown>) =>
    settingsPatchSchema.safeParse(clearedToEmpty(patch)).success;

  it("accepts a partial patch and the fields a full read echoes back", () => {
    expect(accepts({ senderName: "Acme" })).to.equal(true);
    expect(
      accepts({ ...CURRENT, webhookUrl: "x", provider: "y", revision: "z" }),
    ).to.equal(true);
    expect(accepts({ replyTo: null })).to.equal(true);
  });

  it("refuses an unknown field or an unknown missing-variables choice", () => {
    expect(accepts({ bogus: 1 })).to.equal(false);
    expect(accepts({ missingVariables: "bogus" })).to.equal(false);
  });

  it("refuses to clear a field that cannot be empty", () => {
    expect(accepts({ webhookSecret: null })).to.equal(false);
    expect(accepts({ fallbackLocale: null })).to.equal(false);
    expect(accepts({ logRetentionDays: null })).to.equal(false);
  });

  it("refuses control characters in the sender name", () => {
    expect(accepts({ senderName: "Acme\r\nBcc: evil@example.com" })).to.equal(
      false,
    );
  });

  it("trims the addresses and writes an IDN domain in ASCII", () => {
    const parsed = settingsPatchSchema.parse({
      senderEmail: " hello@acme.test ",
      replyTo: "hi@exämple.com",
    });
    expect(parsed.senderEmail).to.equal("hello@acme.test");
    expect(parsed.replyTo).to.equal("hi@xn--exmple-cua.com");
  });

  it("accepts any well-formed locale tag", () => {
    expect(accepts({ fallbackLocale: "pt-br" })).to.equal(true);
    expect(accepts({ fallbackLocale: "zh-Hant" })).to.equal(true);
    expect(accepts({ fallbackLocale: "not a locale" })).to.equal(false);
  });
});
