import { expect } from "chai";
import { z } from "zod";
import type { MailingSend } from "../../db";
import { SEND_STATUSES, stageOf } from "../../types";
import { authorizedClient } from "../helpers/http";
import {
  type GoldenAnswers,
  readGolden,
  recordGolden,
} from "../helpers/golden";
import { ensureOwnerSession } from "../helpers/owner";
import { sendRow, templateRow } from "../helpers/rows";

const HTTP_OK = 200;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const METRICS = "/api/mailing/metrics";
const GOLDEN_FILE = "send-figures.golden.json";
const FIXTURE_TIMEOUT_MS = 60_000;

const CURRENT = "from=2001-03-01T00:00:00.000Z&to=2001-03-08T00:00:00.000Z";
const UNTRACKED = "from=2001-06-01T00:00:00.000Z&to=2001-06-03T00:00:00.000Z";
const LOCAL = "from=2001-02-28T22:00:00.000Z&to=2001-03-07T21:59:59.999Z";
const CURRENT_START = Date.parse("2001-03-01T00:00:00.000Z");
const PREVIOUS_START = Date.parse("2001-02-22T00:00:00.000Z");
const UNTRACKED_START = Date.parse("2001-06-01T00:00:00.000Z");

const TEMPLATES = [
  { slug: "figures-orders", category: "orders" },
  { slug: "figures-news", category: "marketing" },
  { slug: "figures-reset", category: "" },
  { slug: "figures-promo", category: "marketing" },
];
const UNKNOWN_SLUG = "figures-gone";
const SLUGS = [...TEMPLATES.map((template) => template.slug), UNKNOWN_SLUG];
const DOMAINS = ["alpha.test", "Beta.TEST", "beta.test", "gamma.test"];
const SOURCES = ["checkout", "", "cron", "manual", "checkout", "api", "admin"];
const ERRORS = ["ECONNREFUSED 127.0.0.1", "Mailbox full", "timed out"];

/** A spread of sends the figures disagree on when any count goes wrong. */
function fixtureRow(index: number, at: Date, prefix: string): MailingSend {
  const status = SEND_STATUSES[(index * 7) % SEND_STATUSES.length];
  const isProblem = ["bounced", "failed", "spam"].includes(status);
  return sendRow({
    _id: `${prefix}-${index}`,
    createdAt: at,
    templateSlug: SLUGS[(index * 3) % SLUGS.length],
    recipientEmail: `user${index}@${DOMAINS[index % DOMAINS.length]}`,
    status,
    stage: stageOf(status, isProblem && index % 4 === 0),
    latencyMs: index % 6 === 0 ? null : (index * 37) % 500,
    opens: index % 3,
    clicks: index % 5 === 0 ? 2 : 0,
    isTest: index % 11 === 0,
    source: SOURCES[index % SOURCES.length] || undefined,
    error: status === "failed" ? ERRORS[index % ERRORS.length] : undefined,
    requestedLocale: index % 7 === 0 ? "fr" : index % 13 === 0 ? "de" : "en",
  });
}

function untrackedRow(index: number): MailingSend {
  return sendRow({
    _id: `untracked-${index}`,
    createdAt: new Date(UNTRACKED_START + index * HOUR_MS),
    templateSlug: SLUGS[index % SLUGS.length],
    recipientEmail: `quiet${index}@alpha.test`,
    status: index % 4 === 0 ? "queued" : "sent",
    latencyMs: index * 10,
  });
}

/** A spot in the week from `start`, spread so that every day gets sends. */
const inWeek = (start: number, index: number): Date =>
  new Date(start + ((index * 5) % 168) * HOUR_MS + index * 1000);

function fixture(now: number): MailingSend[] {
  const rows: MailingSend[] = [];
  for (let index = 0; index < 160; index++)
    rows.push(fixtureRow(index, inWeek(CURRENT_START, index), "current"));
  for (let index = 3; index < 93; index++)
    rows.push(fixtureRow(index, inWeek(PREVIOUS_START, index), "previous"));
  for (let index = 0; index < 12; index++) rows.push(untrackedRow(index));
  for (let index = 0; index < 70; index++) {
    const at = new Date(now - (index % 25) * DAY_MS - index * HOUR_MS);
    rows.push(fixtureRow(index, at, "recent"));
  }
  return rows.sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );
}

const ROUTES = [
  ...[
    "sends",
    "deliverability",
    "open-rate",
    "click-rate",
    "bounces",
    "unsubscribes",
    "queued",
    "latency",
  ].flatMap((metric) => [
    `${METRICS}/kpi/${metric}?${CURRENT}`,
    `${METRICS}/kpi/${metric}?${CURRENT}&comparison=none&audience=operational`,
    `${METRICS}/kpi/${metric}?${UNTRACKED}`,
    `${METRICS}/kpi/${metric}?${LOCAL}`,
  ]),
  `${METRICS}/volume?${CURRENT}`,
  `${METRICS}/volume?${LOCAL}&audience=operational`,
  `${METRICS}/volume?${UNTRACKED}&comparison=none`,
  ...["all", "marketing", "transactional"].flatMap((kind) => [
    `${METRICS}/funnel?${CURRENT}&kind=${kind}`,
    `${METRICS}/funnel?${UNTRACKED}&kind=${kind}`,
  ]),
  ...["open-rate", "click-rate", "sends"].flatMap((metric) => [
    `${METRICS}/top-templates?${CURRENT}&metric=${metric}`,
    `${METRICS}/top-templates?${CURRENT}&metric=${metric}&audience=operational`,
  ]),
  `${METRICS}/domains?${CURRENT}`,
  `${METRICS}/domains?${CURRENT}&audience=operational&comparison=none`,
  `/api/mailing/sends/stats?${CURRENT}`,
  `/api/mailing/sends/stats?${CURRENT}&comparison=none`,
  `/api/mailing/sends/stats?${UNTRACKED}`,
];

const templateFiguresSchema = z.array(
  z.object({ id: z.string(), lastSentAt: z.string().nullable() }).passthrough(),
);

type TemplateFigures = z.infer<typeof templateFiguresSchema>;

/** The per-template figures of the fixture templates, dates as offsets. */
function templateFigures(
  items: TemplateFigures,
  ids: Set<string>,
  now: number,
) {
  return items
    .filter((item) => ids.has(item.id))
    .map((item) => ({
      ...item,
      lastSentAt:
        item.lastSentAt === null ? null : now - Date.parse(item.lastSentAt),
    }));
}

describe("[integration] send figures", function () {
  this.timeout(FIXTURE_TIMEOUT_MS);

  it("answers every figure as the window of sends did", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const { GetModel } =
      await import("@antelopejs/interface-database-decorators");
    const { DEFAULT_TENANT_ID } =
      await import("@antelopejs/interface-dms/constants");
    const { SendModel, TemplateModel } = await import("../../db");
    const sends = GetModel(SendModel, DEFAULT_TENANT_ID);
    const templates = GetModel(TemplateModel, DEFAULT_TENANT_ID);
    const now = Date.now();
    for (const [index, template] of TEMPLATES.entries())
      await templates.insert(
        templateRow({
          _id: `figures-template-${index}`,
          slug: template.slug,
          name: `Figures ${index}`,
          category: template.category,
        }),
      );
    const rows = fixture(now);
    for (const row of rows) await sends.insertImported(row);

    const answers: GoldenAnswers = new Map();
    for (const route of ROUTES) {
      const response = await client.get(route);
      expect(response.status, route).to.equal(HTTP_OK);
      answers.set(route, response.data);
    }
    const ids = new Set(
      TEMPLATES.map((_, index) => `figures-template-${index}`),
    );
    const overview = await client.get("/api/mailing/templates/overview");
    answers.set(
      "templates/overview",
      templateFigures(
        templateFiguresSchema.parse(overview.data.items),
        ids,
        now,
      ),
    );
    for (const id of ids) {
      const performance = await client.get(
        `/api/mailing/templates/${id}/performance`,
      );
      expect(performance.status).to.equal(HTTP_OK);
      answers.set(
        `templates/${id}/performance`,
        templateFigures(
          templateFiguresSchema.parse([performance.data]),
          ids,
          now,
        )[0],
      );
    }

    await Promise.all(rows.map((row) => sends.delete(row._id)));
    await Promise.all([...ids].map((id) => templates.delete(id)));

    if (process.env.SEND_FIGURES_RECORD) recordGolden(GOLDEN_FILE, answers);
    const golden = readGolden(GOLDEN_FILE);
    for (const [key, answer] of golden)
      expect(answers.get(key), key).to.deep.equal(answer);
    expect([...answers.keys()]).to.deep.equal([...golden.keys()]);
  });
});
