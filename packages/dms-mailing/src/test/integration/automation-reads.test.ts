import { expect } from "chai";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { z } from "zod";
import { checkSuppressionsAction } from "../../automation/check-suppressions-action";
import { findSuppressionAction } from "../../automation/find-suppression-action";
import { getSendAction } from "../../automation/get-send-action";
import { getTemplateAction } from "../../automation/get-template-action";
import { renderTemplateAction } from "../../automation/render-template-action";
import { sendTemplateAction } from "../../automation/send-template-action";
import { SendModel, SettingsModel } from "../../db";
import { findSettings } from "../../services/settings";
import { suppressAddress } from "../../services/suppressions";
import {
  declareIn as declared,
  failureOf,
  newTenant,
  seedSend,
  stepCtx,
} from "../helpers/automation";
import { checkedText } from "../helpers/checked";
import { contentWith } from "../helpers/declarations";
import { authorizedClient, eventsPath } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const VARIABLES = { customer: { firstName: "Ann" } };

type Client = ReturnType<typeof authorizedClient>;

async function api(): Promise<Client> {
  const session = await ensureOwnerSession();
  return authorizedClient(session.accessToken);
}

describe("[integration] find-suppression and check-suppressions actions", () => {
  it("tells an entry's reason, note and send, whatever the address's case", async () => {
    const tenantId = await newTenant();
    await suppressAddress(tenantId, {
      email: "found@example.test",
      reason: "complaint",
      sendId: "send-1",
      detail: "Reported",
    });

    const found = await findSuppressionAction.execute(
      { tenantId, email: "Found@Example.test" },
      stepCtx(),
    );
    const absent = await findSuppressionAction.execute(
      { tenantId, email: "absent@example.test" },
      stepCtx(),
    );
    const elsewhere = await findSuppressionAction.execute(
      { tenantId: await newTenant(), email: "found@example.test" },
      stepCtx(),
    );

    expect(found).to.deep.include({
      suppressed: true,
      email: "found@example.test",
      reason: "complaint",
      detail: "Reported",
      sendId: "send-1",
    });
    expect(absent).to.deep.equal({
      suppressed: false,
      email: "absent@example.test",
    });
    expect(elsewhere.suppressed).to.equal(false);
  });

  it("refuses an invalid address rather than answering not suppressed", async () => {
    const failure = await failureOf(
      findSuppressionAction.execute({ email: "typo.example.test" }, stepCtx()),
    );
    expect(failure).to.have.property("message").that.includes("invalid input");
  });

  it("splits a list into allowed, suppressed and invalid, each address once", async () => {
    const tenantId = await newTenant();
    await suppressAddress(tenantId, {
      email: "blocked@example.test",
      reason: "manual",
    });

    const result = await checkSuppressionsAction.execute(
      {
        tenantId,
        emails: [
          "ok@example.test",
          "Blocked@Example.test",
          "not-an-address",
          "OK@example.test",
        ],
      },
      stepCtx(),
    );
    const elsewhere = await checkSuppressionsAction.execute(
      { tenantId: await newTenant(), emails: ["blocked@example.test"] },
      stepCtx(),
    );

    expect(result.allowed).to.deep.equal(["ok@example.test"]);
    expect(result.invalid).to.deep.equal(["not-an-address"]);
    expect(
      result.suppressed.map(({ email, reason }) => ({ email, reason })),
    ).to.deep.equal([{ email: "Blocked@Example.test", reason: "manual" }]);
    expect(result.suppressedCount).to.equal(1);
    expect(elsewhere.allowed).to.deep.equal(["blocked@example.test"]);
  });

  it("refuses more than 1000 addresses", async () => {
    const failure = await failureOf(
      checkSuppressionsAction.execute(
        {
          emails: Array.from({ length: 1001 }, (_, i) => `a${i}@example.test`),
        },
        stepCtx(),
      ),
    );
    expect(failure).to.have.property("message").that.includes("invalid input");
  });
});

describe("[integration] get-send action", () => {
  it("reads a send, its variables and its provider events in order", async () => {
    await declared("get-send");
    const sent = await sendTemplateAction.execute(
      { slug: "get-send", to: "get-send@example.test", variables: VARIABLES },
      stepCtx(),
    );
    const client = await api();
    const settings = await client.get("/api/mailing/settings");
    const detail = await client.get(`/api/mailing/sends/${sent.sendId}`);
    await client.post(
      eventsPath("manual"),
      {
        messageId: checkedText.parse(detail.data.send.providerMessageId),
        type: "opened",
        details: { eventId: "get-send-open" },
      },
      {
        headers: {
          "x-mailing-webhook-secret": checkedText.parse(
            settings.data.webhookSecret,
          ),
        },
      },
    );

    const read = await getSendAction.execute(
      { sendId: sent.sendId },
      stepCtx(),
    );
    const withoutEvents = await getSendAction.execute(
      { sendId: sent.sendId, includeEvents: false },
      stepCtx(),
    );

    expect(read).to.deep.include({
      found: true,
      templateSlug: "get-send",
      recipientEmail: "get-send@example.test",
      status: "opened",
      isTest: false,
      source: "automation:procedure-1",
      opens: 1,
      suppressed: false,
      eventsTruncated: false,
    });
    expect(read.variables).to.deep.equal(VARIABLES);
    expect(read.events?.map((event) => event.type)).to.deep.equal([
      "sent",
      "opened",
    ]);
    expect(read.events?.[1].details).to.deep.equal({
      eventId: "get-send-open",
    });
    expect(withoutEvents.events).to.deep.equal([]);
  });

  it("answers not found for an unknown id, another workspace's send and a send being purged", async () => {
    const tenantId = await newTenant();
    const kept = await seedSend(tenantId);
    const retiring = await seedSend(tenantId);
    await GetModel(SendModel, tenantId)
      .table.get(retiring)
      .update({ isRetiring: true })
      .run();

    const results = await Promise.all([
      getSendAction.execute({ tenantId, sendId: "no-such-send" }, stepCtx()),
      getSendAction.execute(
        { tenantId: await newTenant(), sendId: kept },
        stepCtx(),
      ),
      getSendAction.execute({ tenantId, sendId: retiring }, stepCtx()),
      getSendAction.execute({ tenantId, sendId: kept }, stepCtx()),
    ]);

    expect(results.map((result) => result.found)).to.deep.equal([
      false,
      false,
      false,
      true,
    ]);
    expect(results[0]).to.deep.equal({ found: false, sendId: "no-such-send" });
  });
});

describe("[integration] get-template action", () => {
  it("reads a live template's version, locales and variable contract", async () => {
    const tenantId = await newTenant();
    await declared("get-template", tenantId, { en: "Ready", fr: "Prête" });

    const read = await getTemplateAction.execute(
      { tenantId, slug: "get-template" },
      stepCtx(),
    );
    const french = await getTemplateAction.execute(
      { tenantId, slug: "get-template", locale: "fr" },
      stepCtx(),
    );
    const unknown = await getTemplateAction.execute(
      { tenantId, slug: "no-such-template" },
      stepCtx(),
    );
    const elsewhere = await getTemplateAction.execute(
      { tenantId: await newTenant(), slug: "get-template" },
      stepCtx(),
    );

    expect(read).to.deep.include({
      found: true,
      name: "Ready",
      category: "orders",
      status: "live",
      publishedVersion: 1,
      hasDraft: false,
      locales: ["en"],
      requiredVariables: ["customer.firstName"],
    });
    expect(read.variables).to.deep.equal([
      { path: "customer.firstName", type: "string", required: true },
    ]);
    expect(french.name).to.equal("Prête");
    expect(unknown).to.deep.equal({ found: false, slug: "no-such-template" });
    expect(elsewhere.found).to.equal(false);
  });

  it("reads a draft-only template and a pending draft", async () => {
    const client = await api();
    const created = await client.post("/api/mailing/tables/templates/new", {
      slug: "get-template-draft",
      name: "get-template-draft",
      category: "orders",
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    const live = await declared("get-template-pending");
    await client.post(`/api/mailing/templates/${live.templateId}/content`, {
      content: contentWith("Changed"),
    });

    const draft = await getTemplateAction.execute(
      { slug: "get-template-draft" },
      stepCtx(),
    );
    const pending = await getTemplateAction.execute(
      { slug: "get-template-pending" },
      stepCtx(),
    );

    expect(draft).to.deep.include({ status: "draft", publishedVersion: 0 });
    expect(pending).to.deep.include({ status: "live", hasDraft: true });
  });
});

describe("[integration] render-template action", () => {
  it("renders the published content as a send delivered it, listing missing values", async () => {
    await declared("render-live");
    const sent = await sendTemplateAction.execute(
      { slug: "render-live", to: "render@example.test", variables: VARIABLES },
      stepCtx(),
    );
    const client = await api();
    const delivered = await client.get(
      `/api/mailing/sends/${sent.sendId}/html`,
    );
    const settingsBefore = await GetModel(
      SettingsModel,
      DEFAULT_TENANT_ID,
    ).getAll();
    const sendsBefore = (await GetModel(SendModel, DEFAULT_TENANT_ID).getAll())
      .length;

    const rendered = await renderTemplateAction.execute(
      { slug: "render-live", variables: VARIABLES },
      stepCtx(),
    );
    const missing = await renderTemplateAction.execute(
      { slug: "render-live", includeHtml: false },
      stepCtx(),
    );

    expect(rendered).to.deep.include({
      ...z
        .object({ subject: z.string(), html: z.string() })
        .parse(delivered.data),
      locale: "en",
      version: 1,
      missing: [],
    });
    expect(rendered.text).to.include("Hello Ann");
    expect(missing.missing).to.deep.equal(["customer.firstName"]);
    expect(missing).to.not.have.property("html");
    expect(
      (await GetModel(SendModel, DEFAULT_TENANT_ID).getAll()).length,
    ).to.equal(sendsBefore);
    expect(
      await GetModel(SettingsModel, DEFAULT_TENANT_ID).getAll(),
    ).to.deep.equal(settingsBefore);
  });

  it("renders the draft and a past version, and refuses a draft-only template's published content", async () => {
    const client = await api();
    const live = await declared("render-versions");
    const id = live.templateId;
    await client.post(`/api/mailing/templates/${id}/content`, {
      content: contentWith("Version two"),
    });
    await client.post(`/api/mailing/templates/${id}/publish`, {});
    await client.post(`/api/mailing/templates/${id}/content`, {
      content: contentWith("Pending draft"),
    });
    const created = await client.post("/api/mailing/tables/templates/new", {
      slug: "render-draft-only",
      name: "render-draft-only",
      category: "orders",
    });
    expect(created.status).to.equal(HTTP_OK);
    const render = (slug: string, version?: string) =>
      renderTemplateAction.execute(
        { slug, version, variables: VARIABLES },
        stepCtx(),
      );

    const [published, first, draft] = await Promise.all([
      render("render-versions"),
      render("render-versions", "1"),
      render("render-versions", "draft"),
    ]);
    const failures = await Promise.all([
      failureOf(render("render-draft-only")),
      failureOf(render("no-such-template")),
      failureOf(render("render-versions", "9")),
      failureOf(render("render-versions", "latest")),
    ]);

    expect(
      [published, first, draft].map(({ subject, version }) => ({
        subject,
        version,
      })),
    ).to.deep.equal([
      { subject: "Version two", version: 2 },
      { subject: "Your order is ready", version: 1 },
      { subject: "Pending draft", version: 0 },
    ]);
    expect(
      failures.map((failure) =>
        failure instanceof Error ? failure.message : "",
      ),
    ).to.satisfy(
      (messages: string[]) =>
        messages[0].includes("never published") &&
        messages[1].includes("Unknown template") &&
        messages[2].includes("no version 9") &&
        messages[3].includes("invalid input"),
    );
  });

  it("creates no settings row and finds nothing in another workspace", async () => {
    const tenantId = await newTenant();
    await declared("render-isolated", tenantId);
    await GetModel(SettingsModel, tenantId).delete(tenantId);

    await renderTemplateAction.execute(
      { tenantId, slug: "render-isolated", variables: VARIABLES },
      stepCtx(),
    );
    const elsewhere = await failureOf(
      renderTemplateAction.execute(
        { tenantId: await newTenant(), slug: "render-isolated" },
        stepCtx(),
      ),
    );

    expect(await findSettings(tenantId)).to.equal(undefined);
    expect(elsewhere)
      .to.have.property("message")
      .that.includes("Unknown template");
  });
});
