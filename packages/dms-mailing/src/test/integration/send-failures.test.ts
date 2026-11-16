import { expect } from "chai";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { SendModel } from "../../db";
import type { ImportedSendRow } from "../../db/models/sends.model";
import { isProviderFailure } from "../../services/send-stats";
import { stageOf, type SendStatus } from "../../types";

const HOUR_MS = 3_600_000;
const stamp = Date.now();
const tenantId = `send-failures-${stamp}`;
const origin = stamp - 10 * HOUR_MS;

interface Fixture {
  id: string;
  hoursAgo: number;
  status: SendStatus;
  isTest?: boolean;
  isResolved?: boolean;
}

const FIXTURE: Fixture[] = [
  { id: "late-failure", hoursAgo: 1, status: "failed" },
  { id: "early-failure", hoursAgo: 8, status: "failed" },
  { id: "tied-failure-a", hoursAgo: 5, status: "failed" },
  { id: "tied-failure-b", hoursAgo: 5, status: "failed" },
  { id: "test-failure", hoursAgo: 4, status: "failed", isTest: true },
  { id: "resolved-failure", hoursAgo: 3, status: "failed", isResolved: true },
  { id: "bounce", hoursAgo: 2, status: "bounced" },
  { id: "delivered", hoursAgo: 6, status: "delivered" },
  { id: "before-window", hoursAgo: 20, status: "failed" },
];

function rowOf(fixture: Fixture): ImportedSendRow {
  return {
    _id: fixture.id,
    createdAt: new Date(stamp - fixture.hoursAgo * HOUR_MS),
    templateId: "template",
    templateSlug: "failures",
    locale: "en",
    requestedLocale: "en",
    templateVersion: 1,
    recipientEmail: `${fixture.id}@example.test`,
    status: fixture.status,
    stage: stageOf(fixture.status, fixture.isResolved),
    latencyMs: null,
    json_variables: "{}",
    opens: 0,
    clicks: 0,
    isTest: fixture.isTest ?? false,
  };
}

describe("[integration] provider failures of a window", () => {
  const sends = GetModel(SendModel, tenantId);
  const from = new Date(origin);
  const to = new Date(stamp + HOUR_MS);

  before(async () => {
    for (const fixture of FIXTURE) await sends.insertImported(rowOf(fixture));
  });

  it("keeps the failures the in-memory filter kept, oldest first", async () => {
    const before = (await sends.listBetween(from, to))
      .filter(isProviderFailure)
      .map((send) => send._id);
    const failures = await sends.listProviderFailures(from, to);

    expect(failures.map((send) => send._id).sort()).to.deep.equal(
      [...before].sort(),
    );
    expect(failures.map((send) => send._id)).to.deep.equal([
      "early-failure",
      ...failures
        .map((send) => send._id)
        .filter((id) => id.startsWith("tied-failure")),
      "late-failure",
    ]);
    expect(failures[0]).to.deep.equal({
      _id: "early-failure",
      recipientEmail: "early-failure@example.test",
    });
  });
});
