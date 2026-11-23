import { expect } from "chai";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { z } from "zod";
import { listAttentionAction } from "../../automation/list-attention-action";
import { providerHealthAction } from "../../automation/provider-health-action";
import { sendStatsAction } from "../../automation/send-stats-action";
import { sendTemplateAction } from "../../automation/send-template-action";
import { templatePerformanceAction } from "../../automation/template-performance-action";
import { TemplateModel } from "../../db";
import {
  readCapabilities,
  resetCapabilitiesCache,
} from "../../services/provider";
import {
  declareIn as declared,
  newTenant,
  seedSend,
  stepCtx,
} from "../helpers/automation";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const VARIABLES = { customer: { firstName: "Ann" } };

type Client = ReturnType<typeof authorizedClient>;

const stripFiguresSchema = z.object({
  sends: z.number(),
  tests: z.number(),
  delivered: z.number(),
  problems: z.number(),
  bounced: z.number(),
  failed: z.number(),
  spam: z.number(),
  queued: z.number(),
  latencyMedian: z.number(),
  isDeliveryUntracked: z.boolean(),
});

const performanceSchema = z.object({
  sends: z.number(),
  openRate: z.number(),
  problems: z.number(),
  sources: z.array(z.object({ source: z.string(), count: z.number() })),
});

async function api(): Promise<Client> {
  const session = await ensureOwnerSession();
  return authorizedClient(session.accessToken);
}

describe("[integration] send-stats action", () => {
  it("gives the send log's figures for the same period", async () => {
    const client = await api();
    const to = new Date();
    const from = new Date(to.getTime() - 7 * DAY_MS);
    const query = `from=${from.toISOString()}&to=${to.toISOString()}&comparison=none`;

    const route = await client.get(`/api/mailing/sends/stats?${query}`);
    const action = await sendStatsAction.execute(
      { from: from.toISOString(), to: to.toISOString() },
      stepCtx(),
    );

    expect(route.status).to.equal(HTTP_OK);
    const figures = ({
      sends,
      tests,
      delivered,
      problems,
      bounced,
      failed,
      spam,
      queued,
      latencyMedian,
      isDeliveryUntracked,
    }: z.infer<typeof stripFiguresSchema>) => ({
      sends,
      tests,
      delivered,
      problems,
      bounced,
      failed,
      spam,
      queued,
      latencyMedian,
      isDeliveryUntracked,
    });
    expect(figures(action)).to.deep.equal(
      figures(stripFiguresSchema.parse(route.data)),
    );
    expect(action.previous).to.equal(undefined);
  });

  it("counts a workspace's own sends, tests apart, compares and clips the window", async () => {
    const tenantId = await newTenant();
    const now = Date.now();
    await seedSend(tenantId, { status: "bounced", stage: "problem" });
    await seedSend(tenantId);
    await seedSend(tenantId, { isTest: true });
    await seedSend(tenantId, { createdAt: new Date(now - 10 * DAY_MS) });

    const week = await sendStatsAction.execute(
      {
        tenantId,
        from: new Date(now - 5 * DAY_MS).toISOString(),
        to: new Date(now + HOUR_MS).toISOString(),
        compare: true,
      },
      stepCtx(),
    );
    const wide = await sendStatsAction.execute(
      { tenantId, from: new Date(now - 500 * DAY_MS).toISOString() },
      stepCtx(),
    );
    const elsewhere = await sendStatsAction.execute(
      { tenantId: await newTenant() },
      stepCtx(),
    );

    expect(week).to.deep.include({
      sends: 2,
      tests: 1,
      bounced: 1,
      problems: 1,
    });
    expect(week.previous).to.deep.include({ sends: 1 });
    expect(Date.parse(wide.to) - Date.parse(wide.from)).to.equal(400 * DAY_MS);
    expect(elsewhere.sends).to.equal(0);
  });
});

describe("[integration] template-performance action", () => {
  it("gives a template's figures as its card does, and narrows them to a period", async () => {
    const tenantId = await newTenant();
    const live = await declared("performance", tenantId);
    const now = Date.now();
    await seedSend(tenantId, {
      templateSlug: "performance",
      source: "crm",
      opens: 1,
      status: "opened",
      stage: "engaged",
    });
    await seedSend(tenantId, { templateSlug: "performance", source: "crm" });
    await seedSend(tenantId, { templateSlug: "performance", isTest: true });
    await seedSend(tenantId, {
      templateSlug: "performance",
      createdAt: new Date(now - 20 * DAY_MS),
    });

    const all = await templatePerformanceAction.execute(
      { tenantId, slug: "performance" },
      stepCtx(),
    );
    const recent = await templatePerformanceAction.execute(
      {
        tenantId,
        slug: "performance",
        from: new Date(now - DAY_MS).toISOString(),
      },
      stepCtx(),
    );
    const unknown = await templatePerformanceAction.execute(
      { tenantId: await newTenant(), slug: "performance" },
      stepCtx(),
    );

    expect(all).to.deep.include({
      found: true,
      templateId: live.templateId,
      sends: 3,
    });
    expect(recent).to.deep.include({ sends: 2, openRate: 50 });
    expect(recent.sources).to.deep.equal([{ source: "crm", count: 2 }]);
    expect(unknown).to.deep.equal({ found: false, slug: "performance" });
  });

  it("matches the template drawer's figures for the default window", async () => {
    const live = await declared("performance-route");
    await sendTemplateAction.execute(
      {
        slug: "performance-route",
        to: "perf@example.test",
        variables: VARIABLES,
      },
      stepCtx(),
    );
    const client = await api();

    const route = await client.get(
      `/api/mailing/templates/${live.templateId}/performance`,
    );
    const action = await templatePerformanceAction.execute(
      { slug: "performance-route" },
      stepCtx(),
    );

    expect(route.status).to.equal(HTTP_OK);
    const card = performanceSchema.parse(route.data);
    expect(action).to.deep.include({
      sends: card.sends,
      openRate: card.openRate,
      problems: card.problems,
    });
    expect(action.sources).to.deep.equal(card.sources);
  });
});

describe("[integration] provider-health action", () => {
  it("calls the provider failing from 3 failures making 10 percent of the hour", async () => {
    const tenantId = await newTenant();
    for (let index = 0; index < 7; index++) await seedSend(tenantId);
    for (let index = 0; index < 3; index++)
      await seedSend(tenantId, {
        status: "failed",
        stage: "problem",
        error: "550 rejected",
      });
    await seedSend(tenantId, {
      status: "failed",
      stage: "problem",
      isTest: true,
    });

    const health = await providerHealthAction.execute({ tenantId }, stepCtx());
    const elsewhere = await providerHealthAction.execute(
      { tenantId: await newTenant() },
      stepCtx(),
    );

    expect(health).to.deep.include({
      reachable: true,
      failing: true,
      healthy: false,
      recentFailures: 3,
      transportFailures: 0,
      recentSends: 10,
    });
    expect(elsewhere).to.deep.include({ failing: false, recentFailures: 0 });
  });

  it("calls one transport failure a provider failure", async () => {
    const tenantId = await newTenant();
    await seedSend(tenantId, {
      status: "failed",
      stage: "problem",
      error: "connect ECONNREFUSED 127.0.0.1:25",
    });

    const health = await providerHealthAction.execute({ tenantId }, stepCtx());

    expect(health).to.deep.include({ failing: true, transportFailures: 1 });
  });

  it("leaves out failures someone resolved by sending again", async () => {
    const tenantId = await newTenant();
    for (let index = 0; index < 3; index++)
      await seedSend(tenantId, {
        status: "failed",
        stage: "resolved",
        error: "connect ECONNREFUSED 127.0.0.1:25",
      });

    const health = await providerHealthAction.execute({ tenantId }, stepCtx());

    expect(health).to.deep.include({
      failing: false,
      recentFailures: 0,
      transportFailures: 0,
    });
  });

  it("calls an unreachable provider unhealthy, with no features", async () => {
    resetCapabilitiesCache();
    await readCapabilities(() => Promise.reject(new Error("provider down")));
    try {
      const health = await providerHealthAction.execute({}, stepCtx());

      expect(health).to.deep.include({
        reachable: false,
        healthy: false,
        openTracking: false,
        clickTracking: false,
        batch: false,
      });
    } finally {
      resetCapabilitiesCache();
    }
  });
});

describe("[integration] list-attention action", () => {
  it("lists the flagged templates by slug, filtered and capped", async () => {
    const tenantId = await newTenant();
    const templates = GetModel(TemplateModel, tenantId);
    const flagged = [
      { slug: "b-never", attention: "never_sent" },
      { slug: "a-stale", attention: "stale_draft,missing_locale" },
      { slug: "c-fine", attention: "" },
    ];
    const created: string[] = [];
    for (const { slug } of flagged)
      created.push((await declared(slug, tenantId)).templateId);
    await Promise.all(
      flagged.map(({ attention }, index) =>
        templates.writeAttention(created[index], {
          attention,
          needsAttention: attention !== "",
        }),
      ),
    );

    const all = await listAttentionAction.execute({ tenantId }, stepCtx());
    const neverSent = await listAttentionAction.execute(
      { tenantId, reasons: ["never_sent"] },
      stepCtx(),
    );
    const capped = await listAttentionAction.execute(
      { tenantId, limit: 1 },
      stepCtx(),
    );
    const elsewhere = await listAttentionAction.execute(
      { tenantId: await newTenant() },
      stepCtx(),
    );

    expect(
      all.templates.map(({ slug, reasons }) => ({ slug, reasons })),
    ).to.deep.equal([
      { slug: "a-stale", reasons: ["stale_draft", "missing_locale"] },
      { slug: "b-never", reasons: ["never_sent"] },
    ]);
    expect(neverSent.templates.map(({ slug }) => slug)).to.deep.equal([
      "b-never",
    ]);
    expect(capped).to.deep.include({ count: 2, truncated: true });
    expect(capped.templates).to.have.length(1);
    expect(elsewhere).to.deep.equal({
      templates: [],
      count: 0,
      truncated: false,
    });
  });
});
