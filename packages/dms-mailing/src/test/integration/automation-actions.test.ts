import { expect } from "chai";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { addressSuppressedTrigger } from "../../automation/address-suppressed-trigger";
import { addressUnsuppressedTrigger } from "../../automation/address-unsuppressed-trigger";
import { clearTriggerSubscriptions } from "../../automation/emitter";
import { sendTemplateAction } from "../../automation/send-template-action";
import { suppressAddressAction } from "../../automation/suppress-address-action";
import { unsuppressAddressAction } from "../../automation/unsuppress-address-action";
import { SendModel, SettingsModel, SuppressionModel } from "../../db";
import { SendError } from "../../services/send";
import {
  findSettings,
  getSettings,
  saveSettings,
} from "../../services/settings";
import { suppressAddress } from "../../services/suppressions";
import { capture, newTenant, stepCtx } from "../helpers/automation";
import { checkedText } from "../helpers/checked";
import { declaration, mailing } from "../helpers/declarations";
import { authorizedClient } from "../helpers/http";
import { capturedMail } from "../helpers/mail-store";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const VARIABLES = { customer: { firstName: "Ann" } };

async function declared(slug: string, tenantId = DEFAULT_TENANT_ID) {
  const { DeclareTemplate } = await mailing();
  return DeclareTemplate(declaration(slug, { tenantId }));
}

const sendCount = async (tenantId: string) =>
  (await GetModel(SendModel, tenantId).getAll()).length;

const entryOf = (tenantId: string, email: string) =>
  GetModel(SuppressionModel, tenantId).findByEmail(email);

async function failureOf(run: Promise<unknown>): Promise<Error | undefined> {
  return run.then(
    () => undefined,
    (error: unknown) =>
      error instanceof Error ? error : new Error(String(error)),
  );
}

async function sendErrorCode(run: Promise<unknown>): Promise<string> {
  const error = await failureOf(run);
  expect(error).to.be.instanceOf(SendError);
  return error instanceof SendError ? error.code : "";
}

describe("[integration] send-template test runs", () => {
  it("renders a live template and records, sends and stores nothing", async () => {
    await declared("dry-live");
    const sendsBefore = await sendCount(DEFAULT_TENANT_ID);
    const mailBefore = capturedMail().length;
    const ctx = stepCtx("procedure-1", true);

    const result = await sendTemplateAction.dryRun!(
      {
        tenantId: "",
        slug: "dry-live",
        to: "dry@example.test",
        variables: VARIABLES,
      },
      ctx,
    );

    expect(result).to.deep.include({ status: "sent", sendId: "" });
    expect(await sendCount(DEFAULT_TENANT_ID)).to.equal(sendsBefore);
    expect(capturedMail()).to.have.length(mailBefore);
    expect(ctx.logged).to.have.length(1);
    expect(ctx.logged[0]).to.deep.include({
      level: "info",
      message: 'test run: template "dry-live" not sent',
    });
    expect(ctx.logged[0].value).to.deep.include({
      subject: "Your order is ready",
      locale: "en",
      version: 1,
      suppressed: 0,
    });
  });

  it("keeps the recipients' order and tells the suppressed and the invalid ones", async () => {
    await declared("dry-mixed");
    await suppressAddress(DEFAULT_TENANT_ID, {
      email: "dry-blocked@example.test",
      reason: "manual",
    });

    const result = await sendTemplateAction.dryRun!(
      {
        slug: "dry-mixed",
        to: [
          "dry-ok@example.test",
          "Dry-Blocked@example.test",
          "not-an-address",
        ],
        variables: VARIABLES,
      },
      stepCtx("procedure-1", true),
    );

    expect(
      result.results?.map(({ sendId, status, error }) => ({
        sendId,
        status,
        error,
      })),
    ).to.deep.equal([
      { sendId: "", status: "sent", error: undefined },
      {
        sendId: "",
        status: "suppressed",
        error: "$dms_mailing.errors.suppressed.manual",
      },
      {
        sendId: "",
        status: "failed",
        error: "$dms_mailing.errors.invalid_recipient",
      },
    ]);
    expect(result.status).to.equal("failed");
  });
});

describe("[integration] send-template test run refusals", () => {
  it("refuses what a send refuses: an unknown slug, a draft, a missing value", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const draft = await client.post("/api/mailing/tables/templates/new", {
      slug: "dry-draft",
      name: "dry-draft",
      category: "orders",
    });
    expect(draft.status, JSON.stringify(draft.data)).to.equal(HTTP_OK);
    const tenantId = await newTenant();
    await declared("dry-blocking", tenantId);
    const settings = await getSettings(tenantId);
    await saveSettings(tenantId, {
      ...settings,
      blockOnMissingVariables: true,
    });
    const dry = (slug: string, tenant = DEFAULT_TENANT_ID) =>
      sendTemplateAction.dryRun!(
        { tenantId: tenant, slug, to: "dry@example.test" },
        stepCtx("procedure-1", true),
      );

    expect(await sendErrorCode(dry("no-such-template"))).to.equal(
      "template_not_found",
    );
    expect(await sendErrorCode(dry("dry-draft"))).to.equal("template_not_live");
    expect(await sendErrorCode(dry("dry-blocking", tenantId))).to.equal(
      "missing_variables",
    );
  });

  it("creates no settings row for a workspace that has none", async () => {
    const tenantId = await newTenant();
    await declared("dry-no-settings", tenantId);
    await GetModel(SettingsModel, tenantId).delete(tenantId);

    await sendTemplateAction.dryRun!(
      {
        tenantId,
        slug: "dry-no-settings",
        to: "dry@example.test",
        variables: VARIABLES,
      },
      stepCtx("procedure-1", true),
    );

    expect(await findSettings(tenantId)).to.equal(undefined);
  });

  it("finds a template only in its own workspace, and fails on an unknown one", async () => {
    const owner = await newTenant();
    const other = await newTenant();
    await declared("dry-isolated", owner);

    expect(
      await sendErrorCode(
        sendTemplateAction.dryRun!(
          { tenantId: other, slug: "dry-isolated", to: "dry@example.test" },
          stepCtx("procedure-1", true),
        ),
      ),
    ).to.equal("template_not_found");
    const unknown = await failureOf(
      sendTemplateAction.dryRun!(
        { tenantId: "no-such-tenant", slug: "dry-isolated", to: "a@b.c" },
        stepCtx("procedure-1", true),
      ),
    );
    expect(unknown).to.have.property("message").that.includes("unknown tenant");
  });
});

describe("[integration] suppress-address action", () => {
  afterEach(() => {
    clearTriggerSubscriptions();
  });

  it("adds an address once, as the procedure, keeping the first reason", async () => {
    const tenantId = await newTenant();
    const ctx = stepCtx("procedure-7");

    const first = await suppressAddressAction.execute(
      { tenantId, email: " Action-Add@Example.test ", detail: "From CRM" },
      ctx,
    );
    const second = await suppressAddressAction.execute(
      { tenantId, email: "action-add@example.test", reason: "unsubscribe" },
      ctx,
    );

    expect(first).to.deep.include({
      added: true,
      email: "action-add@example.test",
      reason: "manual",
    });
    expect(second).to.deep.include({ added: false, reason: "manual" });
    expect(second.createdAt).to.equal(first.createdAt);
    const row = await entryOf(tenantId, "action-add@example.test");
    expect(row).to.deep.include({
      createdBy: "automation:procedure-7",
      detail: "From CRM",
      sendId: "",
    });
  });

  it("refuses an invalid address, a long note and a provider reason before writing", async () => {
    const tenantId = await newTenant();
    const refusals = await Promise.all([
      failureOf(
        suppressAddressAction.execute({ tenantId, email: "nope" }, stepCtx()),
      ),
      failureOf(
        suppressAddressAction.execute(
          { tenantId, email: "long@example.test", detail: "x".repeat(501) },
          stepCtx(),
        ),
      ),
      failureOf(
        suppressAddressAction.execute(
          { tenantId, email: "bounce@example.test", reason: "hard_bounce" },
          stepCtx(),
        ),
      ),
    ]);

    for (const refusal of refusals)
      expect(refusal)
        .to.have.property("message")
        .that.includes("mailing.suppress-address: invalid input");
    expect(await GetModel(SuppressionModel, tenantId).getAll()).to.deep.equal(
      [],
    );
  });

  it("simulates in a test run: nothing stored, nothing fired", async () => {
    const tenantId = await newTenant();
    const { received } = await capture(addressSuppressedTrigger, {
      includeAutomationWrites: true,
    });

    const result = await suppressAddressAction.dryRun!(
      { tenantId, email: "Dry-Add@example.test" },
      stepCtx("procedure-1", true),
    );

    expect(result).to.deep.include({
      added: true,
      email: "dry-add@example.test",
      reason: "manual",
    });
    expect(await entryOf(tenantId, "dry-add@example.test")).to.equal(undefined);
    expect(received).to.deep.equal([]);
  });

  it("is ignored by a saved trigger and told, with the procedure, to one that takes procedure changes", async () => {
    const tenantId = await newTenant();
    const saved = await capture(addressSuppressedTrigger, {});
    const opted = await capture(addressSuppressedTrigger, {
      includeAutomationWrites: true,
    });
    const ctx = stepCtx("procedure-9");

    await suppressAddressAction.execute(
      { tenantId, email: "origin@example.test" },
      ctx,
    );

    expect(saved.received).to.deep.equal([]);
    expect(opted.received).to.have.length(1);
    expect(opted.received[0]).to.deep.include({
      tenantId,
      email: "origin@example.test",
      createdBy: "automation:procedure-9",
      originProcedureId: "procedure-9",
      originRunId: ctx.runId,
    });
  });

  it("writes into its own workspace only, and the next send skips the address", async () => {
    const tenantId = await newTenant();
    const other = await newTenant();
    await declared("action-suppressed", tenantId);

    await suppressAddressAction.execute(
      { tenantId, email: "isolated@example.test" },
      stepCtx(),
    );
    const sent = await sendTemplateAction.execute(
      {
        tenantId,
        slug: "action-suppressed",
        to: "isolated@example.test",
        variables: VARIABLES,
      },
      stepCtx(),
    );

    expect(await entryOf(other, "isolated@example.test")).to.equal(undefined);
    expect(sent.status).to.equal("suppressed");
  });
});

describe("[integration] unsuppress-address action", () => {
  afterEach(() => {
    clearTriggerSubscriptions();
  });

  it("lifts manual and unsubscribe entries, and the next send leaves", async () => {
    const tenantId = await newTenant();
    await declared("action-lifted", tenantId);
    await suppressAddress(tenantId, {
      email: "m@example.test",
      reason: "manual",
    });
    await suppressAddress(tenantId, {
      email: "u@example.test",
      reason: "unsubscribe",
    });

    const manual = await unsuppressAddressAction.execute(
      { tenantId, email: "M@Example.test" },
      stepCtx(),
    );
    const unsubscribed = await unsuppressAddressAction.execute(
      { tenantId, email: "u@example.test" },
      stepCtx(),
    );
    const sent = await sendTemplateAction.execute(
      {
        tenantId,
        slug: "action-lifted",
        to: "m@example.test",
        variables: VARIABLES,
      },
      stepCtx(),
    );

    expect(manual).to.deep.equal({
      removed: true,
      email: "m@example.test",
      wasSuppressed: true,
      reason: "manual",
      refused: false,
    });
    expect(unsubscribed).to.deep.include({
      removed: true,
      reason: "unsubscribe",
    });
    expect(await GetModel(SuppressionModel, tenantId).getAll()).to.deep.equal(
      [],
    );
    expect(sent.status).to.equal("sent");
  });

  it("keeps a provider's bounce and complaint unless forced", async () => {
    const tenantId = await newTenant();
    await suppressAddress(tenantId, {
      email: "c@example.test",
      reason: "complaint",
    });
    await suppressAddress(tenantId, {
      email: "b@example.test",
      reason: "hard_bounce",
    });

    const kept = await Promise.all(
      ["c@example.test", "b@example.test"].map((email) =>
        unsuppressAddressAction.execute({ tenantId, email }, stepCtx()),
      ),
    );
    const forced = await unsuppressAddressAction.execute(
      { tenantId, email: "c@example.test", force: true },
      stepCtx(),
    );

    expect(
      kept.map(({ removed, refused }) => ({ removed, refused })),
    ).to.deep.equal([
      { removed: false, refused: true },
      { removed: false, refused: true },
    ]);
    expect(forced).to.deep.include({
      removed: true,
      refused: false,
      reason: "complaint",
    });
    expect(await entryOf(tenantId, "b@example.test")).to.not.equal(undefined);
  });
});

describe("[integration] unsuppress-address action edges", () => {
  afterEach(() => {
    clearTriggerSubscriptions();
  });

  it("answers an address that is not on the list, and refuses an invalid one", async () => {
    const tenantId = await newTenant();

    const absent = await unsuppressAddressAction.execute(
      { tenantId, email: "absent@example.test" },
      stepCtx(),
    );
    const invalid = await failureOf(
      unsuppressAddressAction.execute({ tenantId, email: "nope" }, stepCtx()),
    );

    expect(absent).to.deep.include({
      removed: false,
      wasSuppressed: false,
      refused: false,
    });
    expect(invalid).to.have.property("message").that.includes("invalid input");
  });

  it("simulates in a test run: the entry stays, nothing fires", async () => {
    const tenantId = await newTenant();
    await suppressAddress(tenantId, {
      email: "dry-lift@example.test",
      reason: "manual",
    });
    const { received } = await capture(addressUnsuppressedTrigger, {
      includeAutomationWrites: true,
    });

    const result = await unsuppressAddressAction.dryRun!(
      { tenantId, email: "dry-lift@example.test" },
      stepCtx("procedure-1", true),
    );

    expect(result).to.deep.include({ removed: true, wasSuppressed: true });
    expect(await entryOf(tenantId, "dry-lift@example.test")).to.not.equal(
      undefined,
    );
    expect(received).to.deep.equal([]);
  });

  it("lifts in its own workspace only, and a saved trigger ignores the procedure's lift", async () => {
    const tenantId = await newTenant();
    const other = await newTenant();
    await suppressAddress(tenantId, {
      email: "iso-lift@example.test",
      reason: "manual",
    });
    const saved = await capture(addressUnsuppressedTrigger, {});
    const opted = await capture(addressUnsuppressedTrigger, {
      includeAutomationWrites: true,
    });

    const elsewhere = await unsuppressAddressAction.execute(
      { tenantId: other, email: "iso-lift@example.test" },
      stepCtx(),
    );
    await unsuppressAddressAction.execute(
      { tenantId, email: "iso-lift@example.test" },
      stepCtx("procedure-3"),
    );

    expect(elsewhere.wasSuppressed).to.equal(false);
    expect(saved.received).to.deep.equal([]);
    expect(opted.received).to.have.length(1);
    expect(opted.received[0]).to.deep.include({
      removedBy: "automation:procedure-3",
      originProcedureId: "procedure-3",
    });
    expect(checkedText.parse(opted.received[0].removedAt)).to.be.a("string");
  });
});
