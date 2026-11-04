import { expect } from "chai";
import { declaration, mailing } from "../helpers/declarations";

/**
 * Categories live in the workspace settings, which the settings suite checks
 * against the defaults: these declarations go to a workspace of their own.
 */
describe("[integration] template category declarations", () => {
  const stamp = Date.now();
  const tenantId = `declarations-${stamp}`;

  async function storedCategories() {
    const { getSettings } = await import("../../services/settings");
    return (await getSettings(tenantId)).categories;
  }

  async function categoryIds(): Promise<string[]> {
    return (await storedCategories()).map((category) => category.id);
  }

  it("adds categories once, even declared together", async () => {
    const { DeclareTemplateCategory, DeclareTemplate } = await mailing();
    const ids = ["subscriptions", "events"];
    const results = await Promise.all(
      ids.map((id) =>
        DeclareTemplateCategory({
          tenantId,
          id,
          label: { en: `Declared ${id}` },
          icon: "i-ph-tag",
        }),
      ),
    );
    expect(results.map((result) => result.outcome)).to.deep.equal([
      "created",
      "created",
    ]);
    expect(await categoryIds()).to.include.members(ids);
    const again = await DeclareTemplateCategory({
      tenantId,
      id: "subscriptions",
      label: { en: "Declared subscriptions" },
      icon: "i-ph-tag",
    });
    expect(again.outcome).to.equal("kept");

    const template = await DeclareTemplate(
      declaration("in-category", { tenantId, category: "subscriptions" }),
    );
    expect(template.outcome).to.equal("created");
  });

  it("never relabels a category the workspace already has", async () => {
    const { DeclareTemplateCategory } = await mailing();
    const id = "workshops";
    const declare = (en: string) =>
      DeclareTemplateCategory({
        tenantId,
        id,
        label: { en },
        icon: "i-ph-tag",
      });
    expect((await declare("Workshops")).outcome).to.equal("created");

    expect((await declare("Trainings")).outcome).to.equal("kept");
    const labels = (await storedCategories()).map((category) => category.label);
    expect(labels).to.deep.include({ en: "Workshops" });
    expect(labels).to.not.deep.include({ en: "Trainings" });
  });

  it("leaves a default category as the workspace has it", async () => {
    const { DeclareTemplateCategory } = await mailing();
    const result = await DeclareTemplateCategory({
      tenantId,
      id: "billing",
      label: { en: "Invoices" },
      icon: "i-ph-receipt",
    });
    expect(result.outcome).to.equal("kept");
  });

  it("refuses a label another category already has", async () => {
    const { DeclareTemplateCategory } = await mailing();
    const error = await DeclareTemplateCategory({
      tenantId,
      id: "invoices",
      label: { en: "Billing" },
      icon: "i-ph-receipt",
    }).catch((reason: unknown) => reason);
    expect(error).to.have.property("code", "invalid_category");
  });
});

/** The sender lives in the workspace settings too: a workspace of its own. */
describe("[integration] sender declarations", () => {
  const stamp = Date.now();
  const tenantId = `sender-${stamp}`;
  const sender = {
    tenantId,
    name: "Acme",
    email: "hello@acme.example",
    replyTo: "support@acme.example",
  };

  async function storedSender() {
    const { getSettings } = await import("../../services/settings");
    const { senderName, senderEmail, replyTo } = await getSettings(tenantId);
    return { senderName, senderEmail, replyTo };
  }

  it("writes the sender of the workspace", async () => {
    const { DeclareSender } = await mailing();
    expect(await DeclareSender(sender)).to.equal(undefined);
    expect(await storedSender()).to.deep.equal({
      senderName: "Acme",
      senderEmail: "hello@acme.example",
      replyTo: "support@acme.example",
    });
  });

  it("replaces the stored sender and leaves the other settings", async () => {
    const { DeclareSender } = await mailing();
    const { getSettings } = await import("../../services/settings");
    const before = await getSettings(tenantId);
    await DeclareSender({ tenantId, email: "noreply@acme.example" });
    expect(await storedSender()).to.deep.equal({
      senderName: "",
      senderEmail: "noreply@acme.example",
      replyTo: "",
    });
    const after = await getSettings(tenantId);
    expect({
      ...after,
      senderName: before.senderName,
      senderEmail: before.senderEmail,
      replyTo: before.replyTo,
    }).to.deep.equal(before);
  });

  it("refuses a missing address or tenant, naming the field", async () => {
    const { DeclareSender } = await mailing();
    const refusals = [
      { ...sender, email: "" },
      { ...sender, email: "not an address" },
      { ...sender, tenantId: " " },
    ];
    for (const [index, input] of refusals.entries()) {
      const error = await DeclareSender(input).catch(
        (reason: unknown) => reason,
      );
      expect(error).to.include({ code: "invalid_sender" });
      expect(error)
        .to.have.property("message")
        .that.includes(index < 2 ? "email" : "tenantId");
    }
  });
});
