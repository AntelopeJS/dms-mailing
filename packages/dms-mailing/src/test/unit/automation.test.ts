import { expect } from "chai";
import { unregisterAutomationNodes } from "../../automation";
import {
  type AddressSuppressedPayload,
  addressSuppressedChannel,
  addressSuppressedTrigger,
} from "../../automation/address-suppressed-trigger";
import { addressUnsuppressedTrigger } from "../../automation/address-unsuppressed-trigger";
import { checkSuppressionsAction } from "../../automation/check-suppressions-action";
import {
  type EmailEventPayload,
  emailEventTrigger,
  emitEmailEvent,
} from "../../automation/email-event-trigger";
import { clearTriggerSubscriptions } from "../../automation/emitter";
import { findSuppressionAction } from "../../automation/find-suppression-action";
import { getSendAction } from "../../automation/get-send-action";
import { getTemplateAction } from "../../automation/get-template-action";
import { listAttentionAction } from "../../automation/list-attention-action";
import {
  AutomationLoopGuard,
  automationLoopGuard,
  LOOP_GUARD_LIMIT,
  LOOP_GUARD_WINDOW_MS,
} from "../../automation/loop-guard";
import { runAsAutomation } from "../../automation/origin";
import { providerHealthAction } from "../../automation/provider-health-action";
import { renderTemplateAction } from "../../automation/render-template-action";
import {
  type RetentionPurgedPayload,
  retentionPurgedChannel,
  retentionPurgedTrigger,
} from "../../automation/retention-purged-trigger";
import { sendLogLinkData } from "../../automation/send-log-link-data";
import { sendStatsAction } from "../../automation/send-stats-action";
import { sendTemplateAction } from "../../automation/send-template-action";
import { templatePerformanceAction } from "../../automation/template-performance-action";
import {
  type TemplatePublishedPayload,
  templatePublishedChannel,
  templatePublishedTrigger,
} from "../../automation/template-published-trigger";
import {
  type TemplateStatusChangedPayload,
  templateStatusChangedChannel,
  templateStatusChangedTrigger,
} from "../../automation/template-status-changed-trigger";
import { problemsLink } from "../../services/notify";
import { capture, stepCtx } from "../helpers/automation";

const EVENT: EmailEventPayload = {
  tenantId: "t",
  sendId: "s",
  templateSlug: "x",
  type: "bounced",
  recipientEmail: "a@b",
  isTest: false,
  deliveryId: "s:e1",
  at: "2026-11-20T00:00:00.000Z",
};

const SUPPRESSED: AddressSuppressedPayload = {
  tenantId: "t",
  suppressionId: "id",
  email: "a@b.c",
  reason: "complaint",
  sendId: "s",
  createdBy: "",
  createdAt: "2026-11-20T00:00:00.000Z",
  deliveryId: "id:1",
};

const PUBLISHED: TemplatePublishedPayload = {
  tenantId: "t",
  templateId: "tpl",
  slug: "welcome",
  version: 1,
  previousVersion: 0,
  isNewVersion: true,
  previousStatus: "draft",
  changeCount: 1,
  locales: ["en"],
  publishedBy: "Ann",
  origin: "editor",
  publishedAt: "2026-11-20T00:00:00.000Z",
  deliveryId: "tpl:r1",
};

const STATUS_CHANGED: TemplateStatusChangedPayload = {
  tenantId: "t",
  templateId: "tpl",
  slug: "welcome",
  previousStatus: "live",
  status: "archived",
  action: "archive",
  publishedVersion: 1,
  changedBy: "Ann",
  changedAt: "2026-11-20T00:00:00.000Z",
  deliveryId: "tpl:r2",
};

const PURGED: RetentionPurgedPayload = {
  tenantId: "t",
  purged: 3,
  capped: false,
  retentionDays: 90,
  cutoff: "2026-08-22T00:00:00.000Z",
  runDay: "2026-11-20",
  finishedAt: "2026-11-20T03:15:01.000Z",
  deliveryId: "t:retention:2026-11-20",
};

const ORIGIN = { procedureId: "procedure-1", runId: "run-1" };

describe("[unit] automation send-template action", () => {
  it("needs only the slug and the recipients, the workspace defaulting", () => {
    expect(sendTemplateAction.id).to.equal("mailing.send-template");
    expect(sendTemplateAction.inputSchema).to.deep.include({
      required: ["slug", "to"],
    });
  });

  it("accepts a list of recipients on the `to` port, not just one address", () => {
    const schema = sendTemplateAction.inputSchema;
    expect(schema)
      .to.have.nested.property("properties.to.type")
      .that.deep.equals(["string", "array"]);
    expect(schema)
      .to.have.nested.property("properties.to.items")
      .that.deep.equals({ type: "string" });
  });

  it("logs the message of a send that fails, as text", async () => {
    const ctx = stepCtx();
    const failure = await sendTemplateAction
      .execute({ tenantId: "t", slug: "no-such-template", to: "a@b.c" }, ctx)
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(failure).to.be.instanceOf(Error);
    expect(
      ctx.logged.map(({ level, value }) => ({ level, value })),
    ).to.deep.equal([
      {
        level: "error",
        value: failure instanceof Error ? failure.message : undefined,
      },
    ]);
  });
});

describe("[unit] automation node declarations", () => {
  it("declares the reads free of side effects, so a test run runs them for real", () => {
    for (const action of [
      findSuppressionAction,
      getSendAction,
      checkSuppressionsAction,
      getTemplateAction,
      renderTemplateAction,
      sendStatsAction,
      templatePerformanceAction,
      providerHealthAction,
      listAttentionAction,
    ])
      expect(action.sideEffects, action.id).to.equal(false);
  });

  it("offers the automation-writes switch only on the triggers procedures can cause", () => {
    const switched = [
      emailEventTrigger,
      addressSuppressedTrigger,
      addressUnsuppressedTrigger,
      templatePublishedTrigger,
      templateStatusChangedTrigger,
      retentionPurgedTrigger,
    ]
      .filter(
        (trigger) =>
          trigger.configSchema.properties?.includeAutomationWrites !==
          undefined,
      )
      .map((trigger) => trigger.id);
    expect(switched).to.deep.equal([
      "mailing.address-suppressed",
      "mailing.address-unsuppressed",
    ]);
  });
});

describe("[unit] automation e-mail event trigger", () => {
  afterEach(() => {
    clearTriggerSubscriptions();
  });

  it("fans e-mail events out to active trigger subscriptions filtered by type", async () => {
    const opened = { ...EVENT, type: "opened" as const };
    const { received, stop } = await capture(emailEventTrigger, {
      types: ["bounced"],
    });
    emitEmailEvent(opened);
    emitEmailEvent(EVENT);
    await stop();
    emitEmailEvent(EVENT);
    expect(received).to.deep.equal([EVENT]);
  });

  it("fans every event out to a subscription that filters no type", async () => {
    const { received } = await capture(emailEventTrigger, {});
    emitEmailEvent({ ...EVENT, type: "opened" });
    expect(received).to.have.length(1);
  });

  it("leaves test sends out of a saved config without the switch, and in with it", async () => {
    const saved = await capture(emailEventTrigger, {});
    const opted = await capture(emailEventTrigger, { includeTests: true });
    const test = { ...EVENT, isTest: true };
    emitEmailEvent(test);
    expect(saved.received).to.deep.equal([]);
    expect(opted.received).to.deep.equal([test]);
  });

  it("fires only for the workspace a config names", async () => {
    const { received } = await capture(emailEventTrigger, { tenantId: " t2 " });
    emitEmailEvent(EVENT);
    emitEmailEvent({ ...EVENT, tenantId: "t2" });
    expect(received.map((payload) => payload.tenantId)).to.deep.equal(["t2"]);
  });

  it("keeps fanning out when a subscription throws", async () => {
    await emailEventTrigger.activate({}, () => {
      throw new Error("subscriber exploded");
    });
    const { received } = await capture(emailEventTrigger, {});
    expect(() => emitEmailEvent(EVENT)).to.not.throw();
    expect(received).to.deep.equal([EVENT]);
  });

  it("clears the subscriptions when the node types are unregistered", async () => {
    const { received } = await capture(emailEventTrigger, {});
    await unregisterAutomationNodes();
    emitEmailEvent(EVENT);
    expect(received).to.have.length(0);
  });
});

describe("[unit] automation suppression triggers", () => {
  afterEach(() => {
    clearTriggerSubscriptions();
    automationLoopGuard.reset();
  });

  it("filters on the entry's reason, empty taking every reason", async () => {
    const complaints = await capture(addressSuppressedTrigger, {
      reasons: ["complaint"],
    });
    const all = await capture(addressSuppressedTrigger, { reasons: [] });
    addressSuppressedChannel.emit({ ...SUPPRESSED, reason: "manual" });
    addressSuppressedChannel.emit(SUPPRESSED);
    expect(complaints.received.map((p) => p.reason)).to.deep.equal([
      "complaint",
    ]);
    expect(all.received).to.have.length(2);
  });

  it("ignores a procedure's change unless the config takes them, and names the procedure", async () => {
    const saved = await capture(addressSuppressedTrigger, {});
    const opted = await capture(addressSuppressedTrigger, {
      includeAutomationWrites: true,
    });
    await runAsAutomation(ORIGIN, () => {
      addressSuppressedChannel.emitOriginated("t|id", SUPPRESSED);
      return Promise.resolve();
    });
    addressSuppressedChannel.emitOriginated("t|id", SUPPRESSED);
    expect(saved.received).to.deep.equal([SUPPRESSED]);
    expect(opted.received).to.deep.equal([
      { ...SUPPRESSED, originProcedureId: "procedure-1", originRunId: "run-1" },
      SUPPRESSED,
    ]);
  });

  it("drops a procedure's changes on one address past the breaker's limit", async () => {
    const { received } = await capture(addressSuppressedTrigger, {
      includeAutomationWrites: true,
    });
    await runAsAutomation(ORIGIN, () => {
      for (let index = 0; index <= LOOP_GUARD_LIMIT; index++)
        addressSuppressedChannel.emitOriginated("t|id", SUPPRESSED);
      addressSuppressedChannel.emitOriginated("t|other", SUPPRESSED);
      return Promise.resolve();
    });
    for (let index = 0; index <= LOOP_GUARD_LIMIT; index++)
      addressSuppressedChannel.emitOriginated("t|id", SUPPRESSED);
    expect(received).to.have.length(2 * LOOP_GUARD_LIMIT + 2);
  });
});

describe("[unit] automation loop guard", () => {
  it("admits a subject up to the limit within the window, then again after it", () => {
    const guard = new AutomationLoopGuard();
    const start = 1_000_000;
    const admitted = Array.from({ length: LOOP_GUARD_LIMIT + 1 }, (_, index) =>
      guard.admit("s", start + index),
    );
    expect(admitted).to.deep.equal([true, true, true, true, true, false]);
    expect(guard.admit("other", start)).to.equal(true);
    expect(guard.admit("s", start + LOOP_GUARD_WINDOW_MS + 1)).to.equal(true);
  });
});

describe("[unit] automation template and retention triggers", () => {
  afterEach(() => {
    clearTriggerSubscriptions();
  });

  it("filters publishes on the slug and leaves declarations out of a saved config", async () => {
    const saved = await capture(templatePublishedTrigger, {});
    const welcome = await capture(templatePublishedTrigger, {
      slugs: ["welcome"],
      includeDeclared: true,
    });
    const declared = { ...PUBLISHED, origin: "declaration" as const };
    templatePublishedChannel.emit(declared);
    templatePublishedChannel.emit({ ...PUBLISHED, slug: "other" });
    expect(saved.received.map((p) => p.slug)).to.deep.equal(["other"]);
    expect(welcome.received).to.deep.equal([declared]);
  });

  it("filters status changes on the new status and the slug", async () => {
    const archived = await capture(templateStatusChangedTrigger, {
      statuses: ["archived"],
      slugs: ["welcome"],
    });
    templateStatusChangedChannel.emit(STATUS_CHANGED);
    templateStatusChangedChannel.emit({ ...STATUS_CHANGED, status: "draft" });
    templateStatusChangedChannel.emit({ ...STATUS_CHANGED, slug: "other" });
    expect(archived.received).to.deep.equal([STATUS_CHANGED]);
  });

  it("fires a purge only from the configured count, one by default", async () => {
    const saved = await capture(retentionPurgedTrigger, {});
    const large = await capture(retentionPurgedTrigger, { minPurged: 10 });
    retentionPurgedChannel.emit(PURGED);
    retentionPurgedChannel.emit({ ...PURGED, purged: 10 });
    expect(saved.received).to.have.length(2);
    expect(large.received.map((p) => p.purged)).to.deep.equal([10]);
  });
});

describe("[unit] automation send-log-link data node", () => {
  it("links to the whole log by default, the owner alert's tab when asked", () => {
    expect(sendLogLinkData.evaluate({ sendId: "s1" })).to.deep.equal({
      link: "/modules/mailing/sends?view=all&record=s1",
    });
    expect(
      sendLogLinkData.evaluate({ sendId: "s1", view: "problems" }).link,
    ).to.equal(problemsLink("s1"));
  });

  it("encodes the id and refuses an unknown tab", () => {
    expect(sendLogLinkData.evaluate({ sendId: "a&b=c" }).link).to.equal(
      "/modules/mailing/sends?view=all&record=a%26b%3Dc",
    );
    expect(() =>
      sendLogLinkData.evaluate({ sendId: "s1", view: "nope" }),
    ).to.throw('unknown view "nope"');
  });

  it("evaluates synchronously, as a data node must", () => {
    const result: unknown = sendLogLinkData.evaluate({ sendId: "s1" });
    expect(result).to.not.be.instanceOf(Promise);
  });
});
