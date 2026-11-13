import { expect } from "chai";

const LOCALIZED_CATEGORIES = [
  {
    id: "orders",
    label: { en: "Orders", fr: "Commandes" },
    icon: "i-ph-package",
    color: "amber",
  },
];

async function storeCategories(tenantId: string, json_categories: string) {
  const { GetModel } =
    await import("@antelopejs/interface-database-decorators");
  const { SettingsModel } = await import("../../db");
  await GetModel(SettingsModel, tenantId).insert({
    _id: tenantId,
    fallbackLocale: "en",
    logRetentionDays: 90,
    blockOnMissingVariables: false,
    senderName: "",
    senderEmail: "",
    replyTo: "",
    json_categories,
    webhookSecret: "s".repeat(40),
    webhookSecretSource: "generated",
  });
}

async function readCategories(tenantId: string) {
  const { findSettings } = await import("../../services/settings");
  return (await findSettings(tenantId))?.categories;
}

describe("[integration] stored template categories", () => {
  const tenantId = `stored-categories-${Date.now()}`;

  it("reads localized labels back unchanged, extra keys kept", async () => {
    const tenant = `${tenantId}-localized`;
    await storeCategories(tenant, JSON.stringify(LOCALIZED_CATEGORIES));
    expect(await readCategories(tenant)).to.deep.equal(LOCALIZED_CATEGORIES);
  });

  it("refuses a category whose label is a plain string", async () => {
    const tenant = `${tenantId}-string-label`;
    await storeCategories(
      tenant,
      '[{"id":"orders","label":"Orders","icon":"i-ph-package"}]',
    );
    const error = await readCategories(tenant).catch(
      (reason: unknown) => reason,
    );
    expect(error).to.be.instanceOf(TypeError);
  });
});
