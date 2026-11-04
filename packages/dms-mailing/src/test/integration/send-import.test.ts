import { expect } from "chai";
import type { ImportedSend } from "@antelopejs/interface-dms-mailing";

const DAY_MS = 86_400_000;
const SLUG = "imported-receipt";

/**
 * Imported sends land in the metrics by their own dates: a workspace of their
 * own keeps them out of the default one the metrics suites read.
 */
describe("[integration] send import", () => {
  const stamp = Date.now();
  const tenantId = `send-import-${stamp}`;
  const sentAt = new Date(stamp - 10 * DAY_MS);

  async function mailing() {
    return import("@antelopejs/interface-dms-mailing");
  }

  async function models() {
    const { GetModel } =
      await import("@antelopejs/interface-database-decorators");
    const { SendEventModel, SendModel } = await import("../../db");
    return {
      sends: GetModel(SendModel, tenantId),
      events: GetModel(SendEventModel, tenantId),
    };
  }

  function history(): ImportedSend[] {
    return [
      {
        importId: "brevo-1",
        templateSlug: SLUG,
        to: { email: "anna@example.test", name: "Anna" },
        sentAt,
        provider: "brevo",
        providerMessageId: "brevo-msg-1",
        events: [
          {
            type: "clicked",
            at: new Date(sentAt.getTime() + 3_600_000),
            details: { eventId: "click-1" },
          },
          {
            type: "clicked",
            at: new Date(sentAt.getTime() + 3_700_000),
            details: { eventId: "click-1" },
          },
          { type: "delivered", at: new Date(sentAt.getTime() + 60_000) },
          { type: "opened", at: new Date(sentAt.getTime() + 1_800_000) },
          { type: "opened", at: new Date(sentAt.getTime() + 1_800_000) },
        ],
      },
      {
        importId: "brevo-2",
        templateSlug: SLUG,
        to: "bounce@example.test",
        sentAt,
        events: [
          {
            type: "bounced",
            at: new Date(sentAt.getTime() + 60_000),
            details: { reason: "550 5.1.1 Mailbox does not exist" },
          },
        ],
      },
      {
        importId: "brevo-3",
        templateSlug: SLUG,
        to: "plain@example.test",
        sentAt,
      },
    ];
  }

  before(async () => {
    const { DeclareTemplate } = await mailing();
    await DeclareTemplate({
      tenantId,
      slug: SLUG,
      name: { en: "Imported receipt" },
      content: {
        locales: { en: { subject: "Your receipt", preheader: "", blocks: [] } },
      },
    });
  });

  it("writes past sends with their dates and folded events, once", async () => {
    const { ImportSends } = await mailing();
    const first = await ImportSends({ tenantId, sends: history() });
    expect(first).to.include({ imported: 3, skipped: 0 });
    expect(first.sendIds).to.have.length(3);

    const again = await ImportSends({ tenantId, sends: history() });
    expect(again).to.include({ imported: 0, skipped: 3 });
    expect(again.sendIds).to.deep.equal(first.sendIds);

    const { sends, events } = await models();
    const [clicked, bounced, plain] = await Promise.all(
      first.sendIds.map((id) => sends.get(id)),
    );
    expect(clicked).to.include({
      status: "clicked",
      stage: "engaged",
      opens: 1,
      clicks: 1,
      templateVersion: 1,
      recipientName: "Anna",
      source: "import",
      locale: "en",
    });
    expect(clicked?.createdAt.getTime()).to.equal(sentAt.getTime());
    expect(bounced).to.include({
      status: "bounced",
      stage: "problem",
      error: "550 5.1.1 Mailbox does not exist",
      isSoftBounce: false,
    });
    expect(plain).to.include({ status: "sent", stage: "in_progress" });

    const timeline = await events.getBySend(first.sendIds[0]);
    expect(timeline.map((event) => event.type).sort()).to.deep.equal([
      "clicked",
      "delivered",
      "opened",
    ]);
    const window = await sends.listBetween(
      new Date(sentAt.getTime() - DAY_MS),
      new Date(),
    );
    expect(window).to.have.length(3);
  });

  it("leaves imported bounces off the suppression list", async () => {
    const { suppressionsOf } = await import("../../services/suppressions");
    const suppressed = await suppressionsOf(tenantId, ["bounce@example.test"]);
    expect(suppressed.size).to.equal(0);
  });

  it("refuses the whole import when a template is unknown", async () => {
    const { ImportSends } = await mailing();
    const error = await ImportSends({
      tenantId,
      sends: [
        {
          importId: "unknown-1",
          templateSlug: "nope",
          to: "x@example.test",
          sentAt,
        },
      ],
    }).catch((reason: unknown) => reason);
    expect(error).to.have.property("code", "template_not_found");
  });

  it("refuses an entry it cannot read, naming the field", async () => {
    const { ImportSends } = await mailing();
    const error = await ImportSends({
      tenantId,
      sends: [
        {
          importId: "invalid-1",
          templateSlug: SLUG,
          to: "not an address",
          sentAt,
        },
      ],
    }).catch((reason: unknown) => reason);
    expect(error).to.include({ code: "invalid_import" });
    expect(error)
      .to.have.property("message")
      .that.matches(/sends\.0\.to/);
  });
});
