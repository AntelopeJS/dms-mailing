import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { expect } from "chai";
import { checkedText } from "../helpers/checked";
import { mailing } from "../helpers/declarations";
import { authorizedClient, createClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const SETTINGS = "/api/mailing/settings";
const ROTATE = `${SETTINGS}/webhook-secret/rotate`;
const HTTP_OK = 200;
const HTTP_CLIENT_ERROR = 400;

const secretOf = (letter: string) => letter.repeat(40);

async function storedSecret(tenantId: string) {
  const { getSettings } = await import("../../services/settings");
  const { webhookSecret, webhookSecretSource } = await getSettings(tenantId);
  return { webhookSecret, webhookSecretSource };
}

async function ownerClient() {
  return authorizedClient((await ensureOwnerSession()).accessToken);
}

describe("[integration] webhook secret declarations", () => {
  const tenantId = `webhook-secret-${Date.now()}`;

  it("sets a declared secret once and answers unchanged after", async () => {
    const { DeclareWebhookSecret } = await mailing();
    const first = await DeclareWebhookSecret({
      tenantId,
      secret: secretOf("a"),
    });
    expect(first).to.deep.equal({ outcome: "set" });
    expect(await storedSecret(tenantId)).to.deep.equal({
      webhookSecret: secretOf("a"),
      webhookSecretSource: "declared",
    });

    const again = await DeclareWebhookSecret({
      tenantId,
      secret: secretOf("a"),
    });
    expect(again).to.deep.equal({ outcome: "unchanged" });
  });

  it("replaces a secret code declared before", async () => {
    const { DeclareWebhookSecret } = await mailing();
    const result = await DeclareWebhookSecret({
      tenantId,
      secret: secretOf("b"),
    });
    expect(result.outcome).to.equal("set");
    expect((await storedSecret(tenantId)).webhookSecret).to.equal(
      secretOf("b"),
    );
  });

  it("keeps the secret of a row stored before its source was kept", async () => {
    const { DeclareWebhookSecret } = await mailing();
    const { GetModel } =
      await import("@antelopejs/interface-database-decorators");
    const { SettingsModel } = await import("../../db");
    const legacyTenant = `${tenantId}-legacy`;
    await GetModel(SettingsModel, legacyTenant).insert({
      _id: legacyTenant,
      fallbackLocale: "en",
      logRetentionDays: 90,
      blockOnMissingVariables: false,
      senderName: "",
      senderEmail: "",
      replyTo: "",
      json_categories: "[]",
      webhookSecret: secretOf("l"),
    });

    const kept = await DeclareWebhookSecret({
      tenantId: legacyTenant,
      secret: secretOf("m"),
    });
    expect(kept.outcome).to.equal("kept");
    expect((await storedSecret(legacyTenant)).webhookSecret).to.equal(
      secretOf("l"),
    );
  });

  it("refuses an invalid secret without echoing it", async () => {
    const { DeclareWebhookSecret } = await mailing();
    const tooShort = "leaked-short-secret";
    const tooLong = "leaked-long-secret-".repeat(10);
    for (const secret of [tooShort, tooLong]) {
      const error = await DeclareWebhookSecret({ tenantId, secret }).catch(
        (reason: unknown) => reason,
      );
      expect(error).to.have.property("code", "invalid_webhook_secret");
      expect(String(error)).to.contain("secret");
      expect(String(error)).to.not.contain("leaked");
    }
    expect((await storedSecret(tenantId)).webhookSecret).to.equal(
      secretOf("b"),
    );
  });
});

describe("[integration] webhook secret the workspace owner set", () => {
  it("keeps a rotated secret unless the declaration replaces it", async () => {
    const { DeclareWebhookSecret } = await mailing();
    const client = await ownerClient();
    const rotated = await client.post(ROTATE, {});
    expect(rotated.status).to.equal(HTTP_OK);
    const rotatedSecret = checkedText.parse(rotated.data.value);
    const tenantId = DEFAULT_TENANT_ID;
    expect(await storedSecret(tenantId)).to.deep.equal({
      webhookSecret: rotatedSecret,
      webhookSecretSource: "operator",
    });

    const kept = await DeclareWebhookSecret({
      tenantId,
      secret: secretOf("c"),
    });
    expect(kept).to.deep.equal({ outcome: "kept" });
    expect((await storedSecret(tenantId)).webhookSecret).to.equal(
      rotatedSecret,
    );

    const replaced = await DeclareWebhookSecret({
      tenantId,
      secret: secretOf("c"),
      replaceRotated: true,
    });
    expect(replaced).to.deep.equal({ outcome: "set" });
    expect(await storedSecret(tenantId)).to.deep.equal({
      webhookSecret: secretOf("c"),
      webhookSecretSource: "declared",
    });
  });

  it("keeps a secret the owner typed in the settings", async () => {
    const { DeclareWebhookSecret } = await mailing();
    const client = await ownerClient();
    const typed = secretOf("d");
    const put = await client.put(SETTINGS, { webhookSecret: typed });
    expect(put.status).to.equal(HTTP_OK);
    expect(put.data).to.not.have.property("webhookSecretSource");
    const read = await client.get(SETTINGS);
    expect(read.data).to.not.have.property("webhookSecretSource");
    const tenantId = DEFAULT_TENANT_ID;
    expect((await storedSecret(tenantId)).webhookSecretSource).to.equal(
      "operator",
    );

    const kept = await DeclareWebhookSecret({
      tenantId,
      secret: secretOf("e"),
    });
    expect(kept.outcome).to.equal("kept");
    expect((await storedSecret(tenantId)).webhookSecret).to.equal(typed);
  });

  it("lets no signed-out caller rotate the secret", async () => {
    const before = await storedSecret(DEFAULT_TENANT_ID);
    const refused = await createClient().post(ROTATE, {});
    expect(refused.status).to.be.at.least(HTTP_CLIENT_ERROR);
    expect(await storedSecret(DEFAULT_TENANT_ID)).to.deep.equal(before);
  });
});
