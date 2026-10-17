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
      name: "Imported receipt",
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

    const timeline = await events.getBySend(first.sendIds[0] as string);
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

  describe("a replacing import", () => {
    const scope = "demo-history";

    function entry(importId: string, to: string): ImportedSend {
      return { importId, templateSlug: SLUG, to, sentAt };
    }

    async function liveSend(): Promise<string> {
      const { sends } = await models();
      const [id] = await sends.insertSend({
        templateId: "live-template",
        templateSlug: SLUG,
        locale: "en",
        requestedLocale: "",
        templateVersion: 1,
        recipientEmail: "live@example.test",
        status: "sent",
        stage: "in_progress",
        latencyMs: 12,
        source: "test",
        json_variables: "{}",
        opens: 0,
        clicks: 0,
        isTest: false,
      });
      return id as string;
    }

    it("rewrites changed entries and removes the ones it no longer lists", async () => {
      const { ImportSends } = await mailing();
      const liveId = await liveSend();
      const unscoped = await ImportSends({
        tenantId,
        sends: [entry("unscoped-1", "kept@example.test")],
      });
      const first = await ImportSends({
        tenantId,
        scope,
        replace: true,
        sends: [
          {
            ...entry("seed-a", "a@example.test"),
            events: history()[1]?.events,
          },
          entry("seed-b", "b@example.test"),
        ],
      });
      expect(first).to.include({ imported: 2, replaced: 0, removed: 0 });

      const again = await ImportSends({
        tenantId,
        scope,
        replace: true,
        sends: [
          entry("seed-a", "a2@example.test"),
          entry("seed-c", "c@example.test"),
        ],
      });
      expect(again).to.include({
        imported: 1,
        replaced: 1,
        skipped: 0,
        removed: 1,
      });

      const { sends, events } = await models();
      const [rewritten, removed] = await Promise.all(
        first.sendIds.map((id) => sends.get(id)),
      );
      expect(rewritten).to.include({
        recipientEmail: "a2@example.test",
        status: "sent",
        importScope: scope,
      });
      const timeline = await events.getBySend(first.sendIds[0] as string);
      expect(timeline.map((event) => event.type)).to.deep.equal(["sent"]);
      expect(removed).to.equal(undefined);
      expect(await events.getBySend(first.sendIds[1] as string)).to.have.length(
        0,
      );
      expect(await sends.get(liveId)).to.include({ status: "sent" });
      expect(await sends.get(unscoped.sendIds[0] as string)).to.not.equal(
        undefined,
      );
    });

    it("skips everything when run again with the same data set", async () => {
      const { ImportSends } = await mailing();
      const sends = [
        entry("seed-a", "a2@example.test"),
        entry("seed-c", "c@example.test"),
      ];
      const result = await ImportSends({
        tenantId,
        scope,
        replace: true,
        sends,
      });
      expect(result).to.include({
        imported: 0,
        replaced: 0,
        skipped: 2,
        removed: 0,
      });
    });

    it("removes the whole scope with an empty list", async () => {
      const { ImportSends } = await mailing();
      const result = await ImportSends({
        tenantId,
        scope,
        replace: true,
        sends: [],
      });
      expect(result).to.include({ imported: 0, removed: 2 });
      const { sends } = await models();
      expect(await sends.listImported(scope)).to.have.length(0);
    });

    it("refuses to replace without a scope", async () => {
      const { ImportSends } = await mailing();
      const error = await ImportSends({
        tenantId,
        replace: true,
        sends: [],
      }).catch((reason: { code?: string; message: string }) => reason);
      expect(error).to.include({ code: "invalid_import" });
      expect((error as Error).message).to.match(/scope/);
    });
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
    }).catch((reason: { code?: string }) => reason);
    expect((error as { code?: string }).code).to.equal("template_not_found");
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
    }).catch((reason: { code?: string; message: string }) => reason);
    expect(error).to.include({ code: "invalid_import" });
    expect((error as Error).message).to.match(/sends\.0\.to/);
  });
});
