import { randomUUID } from "node:crypto";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import type {
  AtomicMutationOutcome,
  ValueProxy,
} from "@antelopejs/interface-database";
import { MAILING_SENDS_TABLE_NAME, MailingSend } from "../tables";

const FIRST_ROW_OFFSET = 0;
const SINGLE_ROW = 1;

type NewSend = Omit<
  MailingSend,
  "_id" | "createdAt" | "revision" | "isRetiring" | "lastActivityAt"
>;

type SendActivity = Pick<
  MailingSend,
  "status" | "opens" | "clicks" | "lastEventAt" | "provider"
>;

function canRetire(row: ValueProxy<MailingSend>, limit: Date) {
  return row
    .key("createdAt")
    .lt(limit)
    .and(row.key("status").ne("queued"))
    .and(row.key("lastEventAt").default(row.key("createdAt")).lt(limit))
    .and(row.key("lastActivityAt").default(row.key("createdAt")).lt(limit));
}

function isInactive(send: MailingSend, limit: Date): boolean {
  return (
    send.status !== "queued" &&
    send.createdAt < limit &&
    (send.lastEventAt ?? send.createdAt) < limit &&
    (send.lastActivityAt ?? send.createdAt) < limit
  );
}

function wasApplied(outcome: AtomicMutationOutcome): boolean {
  if (outcome === "unknown")
    throw new Error("Mailing mutation outcome is unknown; not retrying");
  return outcome === "applied";
}

export class SendModel extends BasicDataModel(
  MailingSend,
  MAILING_SENDS_TABLE_NAME,
) {
  /** Creates a new immutable send identity and initializes its revision. */
  insertSend(send: NewSend): Promise<string[]> {
    return this.table
      .insert({
        ...send,
        _id: randomUUID(),
        createdAt: new Date(),
        revision: randomUUID(),
      })
      .run();
  }

  /** Reads the stored row, including the revision the mutation contract compares. */
  getSnapshot(sendId: string): Promise<MailingSend | undefined> {
    return this.table.get(sendId).run();
  }

  async getByProviderMessageId(
    messageId: string,
  ): Promise<MailingSend | undefined> {
    const rows = await this.table
      .getAll(messageId, "providerMessageId")
      .slice(FIRST_ROW_OFFSET, SINGLE_ROW)
      .run();
    return rows[0];
  }

  listBetween(from: Date, to: Date): Promise<MailingSend[]> {
    return this.table
      .filter((row) => row.key("createdAt").ge(from))
      .filter((row) => row.key("createdAt").lt(to))
      .run();
  }

  listOlderThan(limit: Date, pageSize: number): Promise<MailingSend[]> {
    return this.table
      .filter((row) => row.key("isRetiring").eq(true).or(canRetire(row, limit)))
      .slice(FIRST_ROW_OFFSET, pageSize)
      .run();
  }

  /** Atomically closes an inactive send to new events; retirement is irreversible. */
  async retire(sendId: string, limit: Date): Promise<boolean> {
    const send = await this.getSnapshot(sendId);
    if (!send) return false;
    if (send.isRetiring) return true;
    if (!isInactive(send, limit)) return false;
    const outcome = await this.table
      .atomicMutation(sendId, {
        type: "update",
        revisionField: "revision",
        expectedRevision: send.revision,
        nextRevision: randomUUID(),
        patch: { isRetiring: true },
      })
      .run();
    if (wasApplied(outcome)) return true;
    return (await this.get(sendId))?.isRetiring === true;
  }

  /** Returns the number of retired sends actually deleted, including overlapping sweeps. */
  async deleteRetired(sendId: string): Promise<number> {
    const send = await this.getSnapshot(sendId);
    if (!send?.isRetiring) return 0;
    const outcome = await this.table
      .atomicMutation(sendId, {
        type: "delete",
        revisionField: "revision",
        expectedRevision: send.revision,
      })
      .run();
    return Number(wasApplied(outcome));
  }

  /** Accepts activity only before retirement, using ingestion time rather than provider time. */
  async recordActivity(
    send: MailingSend,
    changes: SendActivity,
  ): Promise<boolean> {
    if (send.isRetiring) return false;
    const patch = Object.fromEntries(
      Object.entries({
        ...changes,
        lastActivityAt: new Date(),
      }).filter(([, value]) => value !== undefined),
    );
    const outcome = await this.table
      .atomicMutation(send._id, {
        type: "update",
        revisionField: "revision",
        expectedRevision: send.revision,
        nextRevision: randomUUID(),
        patch,
      })
      .run();
    return wasApplied(outcome);
  }
}
