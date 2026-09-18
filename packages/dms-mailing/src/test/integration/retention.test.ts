import { randomUUID } from "node:crypto";
import { mock } from "node:test";
import { expect } from "chai";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { AtomicMutationQuery } from "@antelopejs/interface-database/atomic";
import {
  purgeInPages,
  purgeOrphanEvents,
  purgeSend,
} from "../../crons/retention";
import { type MailingSend, SendEventModel, SendModel } from "../../db";
import { recordEmailEvent } from "../../services/events";

const OLD = new Date("2020-01-01T00:00:00Z");
const CUTOFF = new Date("2021-01-01T00:00:00Z");
const PAGE_SIZE = 2;
const MAX_ROWS = 10;

interface Fixture {
  tenantId: string;
  sends: SendModel;
  events: SendEventModel;
}

function fixture(): Fixture {
  const tenantId = randomUUID();
  return {
    tenantId,
    sends: GetModel(SendModel, tenantId),
    events: GetModel(SendEventModel, tenantId),
  };
}

async function seed(
  f: Fixture,
  changes: Partial<MailingSend> = {},
): Promise<string> {
  const [id] = await f.sends.insertSend({
    templateId: "template",
    templateSlug: "retention",
    locale: "en",
    recipientEmail: "retention@example.test",
    status: "delivered",
    providerMessageId: randomUUID(),
    latencyMs: 1,
    json_variables: "{}",
    opens: 0,
    clicks: 0,
    isTest: true,
  });
  await f.sends.table
    .get(id)
    .update({ createdAt: OLD, ...changes })
    .run();
  await f.events.insert({
    sendId: id,
    type: "delivered",
    at: OLD,
    json_details: "{}",
  });
  return id;
}

function sweep(f: Fixture): Promise<number> {
  return purgeInPages(
    {
      async loadPage(size) {
        return (await f.sends.listOlderThan(CUTOFF, size)).map(
          (send) => send._id,
        );
      },
      purgeSend: (id) => purgeSend(f.tenantId, id, CUTOFF),
    },
    { pageSize: PAGE_SIZE, maxRows: MAX_ROWS },
  );
}

async function loseAcknowledgement(
  action: () => Promise<unknown>,
): Promise<number> {
  const original: AtomicMutationQuery["run"] = Object.getOwnPropertyDescriptor(
    AtomicMutationQuery.prototype,
    "run",
  )?.value;
  let calls = 0;
  const run = mock.method(AtomicMutationQuery.prototype, "run");
  run.mock.mockImplementation(async function (this: AtomicMutationQuery) {
    calls++;
    await original.call(this);
    return "unknown";
  });
  try {
    await action().then(
      () => {
        throw new Error("expected unknown outcome failure");
      },
      (error: Error) =>
        expect(error.message).to.include("outcome is unknown; not retrying"),
    );
  } finally {
    run.mock.restore();
  }
  return calls;
}

describe("[integration] replay-safe Mongo retention", () => {
  it("initializes a fresh identity and revision on every send", async () => {
    const f = fixture();
    const sourceId = await seed(f);
    const source = await f.sends.getSnapshot(sourceId);
    expect(source?.revision).to.be.a("string");
    const [first] = await f.sends.insertSend(source!);
    const [second] = await f.sends.insertSend(source!);
    const firstSend = await f.sends.getSnapshot(first);
    const secondSend = await f.sends.getSnapshot(second);
    expect(new Set([sourceId, first, second]).size).to.equal(3);
    expect(firstSend?.revision)
      .to.be.a("string")
      .and.not.equal(source?.revision);
    expect(secondSend?.revision)
      .to.be.a("string")
      .and.not.equal(firstSend?.revision);
    expect(firstSend!.createdAt.getTime()).to.be.greaterThan(CUTOFF.getTime());
    expect(await f.sends.retire(sourceId, CUTOFF)).to.equal(true);
    expect((await f.sends.getSnapshot(sourceId))?.revision)
      .to.be.a("string")
      .and.not.equal(source?.revision);
    expect(await sweep(f)).to.equal(1);
    expect(await f.sends.getAll()).to.have.length(2);
  });

  it("overlapping paged sweeps count each deleted send once", async () => {
    const f = fixture();
    const ids = await Promise.all(Array.from({ length: 5 }, () => seed(f)));
    const counts = await Promise.all([sweep(f), sweep(f)]);
    expect(counts[0] + counts[1]).to.equal(ids.length);
    expect(await f.sends.getAll()).to.deep.equal([]);
    expect(await f.events.getAll()).to.deep.equal([]);
    expect(await sweep(f)).to.equal(0);
  });

  it("preserves new, queued, cutoff-boundary and recently active sends and their events", async () => {
    const f = fixture();
    const changes: Partial<MailingSend>[] = [
      { createdAt: new Date() },
      { createdAt: CUTOFF },
      { status: "queued" },
      { lastEventAt: CUTOFF },
      { lastActivityAt: CUTOFF },
    ];
    const ids = await Promise.all(changes.map((change) => seed(f, change)));
    expect(await f.sends.listOlderThan(CUTOFF, MAX_ROWS)).to.deep.equal([]);
    for (const id of ids)
      expect(await purgeSend(f.tenantId, id, CUTOFF)).to.equal(0);
    expect(await f.sends.getAll()).to.have.length(ids.length);
    expect(await f.events.getAll()).to.have.length(ids.length);
  });

  it("rechecks stale candidates after a backdated webhook activates the send", async () => {
    const f = fixture();
    const id = await seed(f);
    const [candidate] = await f.sends.listOlderThan(CUTOFF, PAGE_SIZE);
    expect(candidate._id).to.equal(id);
    expect(
      await recordEmailEvent(f.tenantId, {
        messageId: candidate.providerMessageId!,
        provider: "fixture",
        type: "opened",
        at: OLD,
      }),
    ).to.equal(true);
    expect(await purgeSend(f.tenantId, id, CUTOFF)).to.equal(0);
    expect((await f.sends.get(id))?.opens).to.equal(1);
    expect(await f.events.getBySend(id)).to.have.length(2);
  });

  it("serializes retirement against concurrent activity at the send document", async () => {
    const f = fixture();
    const id = await seed(f);
    const candidate = await f.sends.get(id);
    const [retired, accepted] = await Promise.all([
      f.sends.retire(id, CUTOFF),
      f.sends.recordActivity(candidate!, {
        status: "opened",
        opens: 1,
        clicks: 0,
        lastEventAt: OLD,
      }),
    ]);
    expect(Number(retired) + Number(accepted)).to.equal(1);
    const send = await f.sends.get(id);
    expect(send?.isRetiring === true).to.equal(retired);
    expect(send?.opens).to.equal(Number(accepted));
  });

  it("retries known conflicts and counts both concurrent opened webhooks", async () => {
    const f = fixture();
    const id = await seed(f);
    const send = await f.sends.get(id);
    const accepted = await Promise.all(
      Array.from({ length: 2 }, () =>
        recordEmailEvent(f.tenantId, {
          messageId: send!.providerMessageId!,
          provider: "fixture",
          type: "opened",
        }),
      ),
    );
    expect(accepted).to.deep.equal([true, true]);
    expect((await f.sends.get(id))?.opens).to.equal(2);
    expect(await f.events.getBySend(id)).to.have.length(3);
    expect(await purgeSend(f.tenantId, id, CUTOFF)).to.equal(0);
  });

  it("does not retry an uncertain webhook write or emit an unacknowledged event", async () => {
    const f = fixture();
    const id = await seed(f);
    const send = await f.sends.get(id);
    const calls = await loseAcknowledgement(() =>
      recordEmailEvent(f.tenantId, {
        messageId: send!.providerMessageId!,
        provider: "fixture",
        type: "opened",
      }),
    );
    expect(calls).to.equal(1);
    expect((await f.sends.get(id))?.opens).to.equal(1);
    expect(await f.events.getBySend(id)).to.have.length(1);
  });

  it("leaves uncertain retirement replayable and never counts an uncertain deletion", async () => {
    const f = fixture();
    const id = await seed(f);
    expect(
      await loseAcknowledgement(() => purgeSend(f.tenantId, id, CUTOFF)),
    ).to.equal(1);
    expect((await f.sends.get(id))?.isRetiring).to.equal(true);
    expect(await f.events.getBySend(id)).to.have.length(1);
    expect(
      await loseAcknowledgement(() => purgeSend(f.tenantId, id, CUTOFF)),
    ).to.equal(1);
    expect(await f.sends.get(id)).to.equal(undefined);
    expect(await f.events.getBySend(id)).to.deep.equal([]);
    expect(await sweep(f)).to.equal(0);
  });

  it("rejects a webhook after retirement and removes an already-paused writer's late event", async () => {
    const f = fixture();
    const id = await seed(f);
    const send = await f.sends.get(id);
    expect(await f.sends.retire(id, CUTOFF)).to.equal(true);
    expect(
      await recordEmailEvent(f.tenantId, {
        messageId: send!.providerMessageId!,
        provider: "fixture",
        type: "opened",
      }),
    ).to.equal(false);
    expect(
      await f.events.insertForActiveSend({
        sendId: id,
        type: "opened",
        at: new Date(),
        json_details: "{}",
      }),
    ).to.equal(false);
    expect(await f.events.getBySend(id)).to.have.length(1);
    expect(await purgeSend(f.tenantId, id, CUTOFF)).to.equal(1);
    expect(
      await f.events.insertForActiveSend({
        sendId: id,
        type: "clicked",
        at: new Date(),
        json_details: "{}",
      }),
    ).to.equal(false);
    expect(await f.events.getBySend(id)).to.deep.equal([]);
  });

  it("retries event cleanup failures after marking", async () => {
    const f = fixture();
    const id = await seed(f);
    const deletion = mock.method(
      SendEventModel.prototype,
      "deleteBySend",
      async () => {
        throw new Error("cleanup unavailable");
      },
    );
    try {
      await purgeSend(f.tenantId, id, CUTOFF).then(
        () => {
          throw new Error("expected cleanup failure");
        },
        (error: Error) => expect(error.message).to.equal("cleanup unavailable"),
      );
    } finally {
      deletion.mock.restore();
    }
    expect((await f.sends.get(id))?.isRetiring).to.equal(true);
    expect(await f.events.getBySend(id)).to.have.length(1);
    expect(await sweep(f)).to.equal(1);
    expect(await sweep(f)).to.equal(0);
  });

  it("retries parent deletion failures after the events are gone", async () => {
    const f = fixture();
    const id = await seed(f);
    const deletion = mock.method(
      SendModel.prototype,
      "deleteRetired",
      async () => {
        throw new Error("delete unavailable");
      },
    );
    try {
      await purgeSend(f.tenantId, id, CUTOFF).then(
        () => {
          throw new Error("expected delete failure");
        },
        (error: Error) => expect(error.message).to.equal("delete unavailable"),
      );
    } finally {
      deletion.mock.restore();
    }
    expect((await f.sends.get(id))?.isRetiring).to.equal(true);
    expect(await f.events.getBySend(id)).to.deep.equal([]);
    expect(await sweep(f)).to.equal(1);
    expect(await sweep(f)).to.equal(0);
  });

  it("reconciles crash-orphaned events across pages without removing active history", async () => {
    const f = fixture();
    const active = await seed(f, { createdAt: new Date() });
    const retired = await seed(f);
    expect(await purgeSend(f.tenantId, retired, CUTOFF)).to.equal(1);
    await f.events.insert(
      Array.from({ length: 5 }, (_value, index) => ({
        sendId: index === 0 ? retired : randomUUID(),
        type: "opened" as const,
        at: new Date(),
        json_details: "{}",
      })),
    );
    await Promise.all([
      purgeOrphanEvents(f.tenantId, PAGE_SIZE),
      purgeOrphanEvents(f.tenantId, PAGE_SIZE),
    ]);
    expect(await f.events.getBySend(active)).to.have.length(1);
    expect(await f.events.getAll()).to.have.length(1);
    expect(await f.events.getBySend(retired)).to.deep.equal([]);
    await f.events.insert({
      sendId: retired,
      type: "clicked",
      at: new Date(),
      json_details: "{}",
    });
    await purgeOrphanEvents(f.tenantId, PAGE_SIZE);
    await purgeOrphanEvents(f.tenantId, PAGE_SIZE);
    expect(await f.events.getBySend(active)).to.have.length(1);
    expect(await f.events.getAll()).to.have.length(1);
  });
});
