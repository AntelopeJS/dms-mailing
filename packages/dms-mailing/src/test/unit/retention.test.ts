import { expect } from "chai";
import cron from "node-cron";
import {
  RETENTION_LIMITS,
  type RetentionLimits,
  type RetentionPass,
  purgeInPages,
  retentionLimit,
  scheduleRetention,
  stopRetention,
} from "../../crons/retention";

const EXTRA_ROW = 1;
const SMALL_LIMITS: RetentionLimits = { pageSize: 2, maxRows: 5 };
const BACKLOG = 100;

interface FakePass extends RetentionPass {
  readonly pageSizes: number[];
  readonly purged: string[];
}

function fakePass(rowCount: number): FakePass {
  const remaining = Array.from({ length: rowCount }, (_row, index) =>
    String(index),
  );
  const pageSizes: number[] = [];
  const purged: string[] = [];
  return {
    pageSizes,
    purged,
    loadPage(size) {
      pageSizes.push(size);
      return Promise.resolve(remaining.slice(0, size));
    },
    purgeSend(sendId) {
      purged.push(sendId);
      remaining.splice(remaining.indexOf(sendId), 1);
      return Promise.resolve(1);
    },
  };
}

describe("[unit] crons/retention", () => {
  it("computes the cutoff from the retention days", () => {
    const now = new Date("2026-09-09T00:00:00.000Z");
    expect(retentionLimit(90, now).toISOString()).to.equal(
      "2026-06-11T00:00:00.000Z",
    );
  });

  it("purges a backlog page by page", async () => {
    const rowCount = RETENTION_LIMITS.pageSize * 2 + EXTRA_ROW;
    const pass = fakePass(rowCount);

    const purged = await purgeInPages(pass);

    expect(purged).to.equal(rowCount);
    expect(pass.purged).to.have.length(rowCount);
    expect(pass.pageSizes).to.deep.equal([
      RETENTION_LIMITS.pageSize,
      RETENTION_LIMITS.pageSize,
      RETENTION_LIMITS.pageSize,
    ]);
  });

  it("stops at the bounded number of rows per run", async () => {
    const pass = fakePass(BACKLOG);

    const purged = await purgeInPages(pass, SMALL_LIMITS);

    expect(purged).to.equal(SMALL_LIMITS.maxRows);
    expect(pass.pageSizes).to.deep.equal([2, 2, 1]);
  });

  it("counts actual deletes and bounds work even when every candidate loses a race", async () => {
    const pass = fakePass(BACKLOG);
    pass.purgeSend = () => Promise.resolve(0);

    expect(await purgeInPages(pass, SMALL_LIMITS)).to.equal(0);
    expect(pass.pageSizes).to.deep.equal([2, 2, 1]);
  });

  it("drops the task from the node-cron registry when it is stopped", async () => {
    const task = scheduleRetention();
    expect(cron.getTasks().has(task.id)).to.equal(true);

    await stopRetention(task);

    expect(cron.getTasks().has(task.id)).to.equal(false);
  });
});
