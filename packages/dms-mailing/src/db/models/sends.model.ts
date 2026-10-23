import { randomUUID } from "node:crypto";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import {
  type AtomicMutationOutcome,
  IsDuplicateKeyError,
  type ValueProxy,
} from "@antelopejs/interface-database";
import { isResolvedStage, stageOf } from "../../types";
import { MAILING_SENDS_TABLE_NAME, MailingSend } from "../tables";

const FIRST_ROW_OFFSET = 0;
const SINGLE_ROW = 1;

type NewSend = Omit<
  MailingSend,
  "_id" | "createdAt" | "revision" | "isRetiring" | "lastActivityAt"
>;

/** A send written by an import: its own id and date, as it happened. */
export type ImportedSendRow = Omit<
  MailingSend,
  "revision" | "isRetiring" | "lastActivityAt"
>;

const MAX_MUTATION_ATTEMPTS = 5;

/** A send as the metrics read it: everything but the rendered variables. */
export type SendSummary = Omit<MailingSend, "json_variables">;

type SendActivity = Pick<
  MailingSend,
  | "status"
  | "opens"
  | "clicks"
  | "lastEventAt"
  | "provider"
  | "error"
  | "isSoftBounce"
>;

/** Who sent a problem again, and the send that did. */
export interface SendReplay {
  replayedBy: string;
  resolvedBy: string;
}

type SendPatch = Partial<MailingSend>;

/** The change to make to a send's latest row, `null` to leave it alone. */
type PatchOf = (send: MailingSend) => SendPatch | null;

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

  /**
   * Writes an imported send under its own id; false when an earlier run of
   * the same import already wrote it (its id is derived from the import's).
   */
  async insertImported(send: ImportedSendRow): Promise<boolean> {
    try {
      await this.table.insert({ ...send, revision: randomUUID() }).run();
      return true;
    } catch (error) {
      if (IsDuplicateKeyError(error)) return false;
      throw error;
    }
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

  listBetween(from: Date, to: Date): Promise<SendSummary[]> {
    return this.table
      .filter((row) => row.key("createdAt").ge(from))
      .filter((row) => row.key("createdAt").lt(to))
      .without("json_variables")
      .run() as Promise<SendSummary[]>;
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
        stage: changes.status
          ? stageOf(changes.status, isResolvedStage(send.stage))
          : undefined,
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

  /**
   * Takes a problem out of the Problems tab before it is sent again, so a
   * second "send the failures again" skips it. `false` when it was already
   * dealt with, or is gone.
   */
  claimResolution(sendId: string, resolvedBy: string): Promise<boolean> {
    return this.mutateLatest(sendId, (send) =>
      isResolvedStage(send.stage)
        ? null
        : {
            resolvedAt: new Date(),
            resolvedBy,
            stage: stageOf(send.status, true),
          },
    );
  }

  /** Puts a claimed problem back when sending it again could not start. */
  releaseResolution(sendId: string): Promise<boolean> {
    return this.mutateLatest(sendId, (send) => ({
      stage: stageOf(send.status),
    }));
  }

  /** Links a send to the one that repeated it; a problem is then resolved. */
  markReplayed(sendId: string, replay: SendReplay): Promise<boolean> {
    return this.mutateLatest(sendId, (send) => ({
      ...replay,
      resolvedAt: new Date(),
      stage: stageOf(send.status, true),
    }));
  }

  /** Links a send again to the send it repeats. */
  linkReplayOf(sendId: string, originalId: string): Promise<boolean> {
    return this.mutateLatest(sendId, () => ({ replayOf: originalId }));
  }

  private async mutateLatest(
    sendId: string,
    patchOf: PatchOf,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < MAX_MUTATION_ATTEMPTS; attempt++) {
      const send = await this.getSnapshot(sendId);
      if (!send || send.isRetiring) return false;
      const patch = patchOf(send);
      if (!patch) return false;
      const outcome = await this.table
        .atomicMutation(sendId, {
          type: "update",
          revisionField: "revision",
          expectedRevision: send.revision,
          nextRevision: randomUUID(),
          patch,
        })
        .run();
      if (wasApplied(outcome)) return true;
    }
    return false;
  }

  /** Sends of a template since `from`, without the rendered variables. */
  listForTemplate(templateSlug: string, from: Date): Promise<SendSummary[]> {
    return this.table
      .getAll(templateSlug, "templateSlug")
      .filter((row) => row.key("createdAt").ge(from))
      .without("json_variables")
      .run() as Promise<SendSummary[]>;
  }

  /** How many sends the retention would delete with this cutoff. */
  countOlderThan(limit: Date): Promise<number> {
    return this.table
      .filter((row) => canRetire(row, limit))
      .count()
      .run();
  }
}
