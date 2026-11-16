import { randomUUID } from "node:crypto";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import {
  type AtomicMutationOutcome,
  IsDuplicateKeyError,
  type Stream,
  type ValueProxy,
} from "@antelopejs/interface-database";
import {
  isResolvedStage,
  RESOLVED_STAGE,
  type SendStatus,
  stageOf,
} from "../../types";
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

const SEND_SUMMARY_FIELDS = [
  "_id",
  "createdAt",
  "templateSlug",
  "recipientEmail",
  "status",
  "stage",
  "latencyMs",
  "opens",
  "clicks",
  "isTest",
  "error",
  "source",
  "locale",
  "requestedLocale",
] as const;

/** A send as the figures read it: only the fields they count. */
export type SendSummary = Pick<
  MailingSend,
  (typeof SEND_SUMMARY_FIELDS)[number]
>;

const SEND_FAILURE_FIELDS = ["_id", "recipientEmail", "error"] as const;

/** A provider failure as the bulk send again and the banner read it. */
export type SendFailure = Pick<
  MailingSend,
  (typeof SEND_FAILURE_FIELDS)[number]
>;

/** Which sends a tally counts: made from `from` until `to`, when it is set. */
export interface SendScope {
  from: Date;
  to?: Date;
  /** Leave test sends out, as the business audience does. */
  isTestLeftOut: boolean;
  /** Only the sends of this template. */
  templateSlug?: string;
}

/** What a tally splits the sends by, besides the traits every figure reads. */
export type TallyGroup =
  | { by: "none" }
  | { by: "template" }
  | { by: "source" }
  /**
   * The recipient's domain, lower-cased once the query answered: the
   * database folds ASCII letters only. Two tallies can then share a domain.
   */
  | { by: "domain" }
  /** The day of the window, counted from `from` in whole days. */
  | { by: "day"; from: Date };

/** The value a tally is grouped on: a slug, a domain, a source or a day. */
export type TallyKey = string | number;

/** The traits of a send the figures read, besides its group. */
export interface SendTraits {
  key: TallyKey;
  status: SendStatus;
  /** Opened or clicked at least once. */
  hasOpens: boolean;
  hasClicks: boolean;
  isTest: boolean;
  isResolved: boolean;
}

/** The sends alike in every trait, counted together. */
export interface SendTally extends SendTraits {
  count: number;
  /** When the earliest and the latest of them were made, in epoch ms. */
  firstAtMs: number;
  lastAtMs: number;
}

/** A send's latency and when it was made, what the latency median reads. */
export type LatencySample = Pick<MailingSend, "createdAt" | "latencyMs">;

/** Recipients who asked for a locale the template did not carry. */
export interface FallbackTally {
  requested: string;
  used: string;
  count: number;
  firstAtMs: number;
}

const MS_PER_SECOND = 1000;
const MS_PER_DAY = 86_400_000;
const LAST_ELEMENT = -1;

/** When a send was made in whole epoch ms; `epoch()` carries float noise. */
const epochMs = (row: ValueProxy<MailingSend>) =>
  row.key("createdAt").epoch().mul(MS_PER_SECOND).round();

function groupKey(row: ValueProxy<MailingSend>, group: TallyGroup) {
  switch (group.by) {
    case "none":
      return "";
    case "template":
      return row.key("templateSlug");
    case "domain":
      return row.key("recipientEmail").split("@").index(LAST_ELEMENT);
    case "source":
      return row.key("source").default("");
    case "day":
      return epochMs(row).sub(group.from.getTime()).div(MS_PER_DAY).floor();
  }
}

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
      .pluck(...SEND_SUMMARY_FIELDS)
      .run();
  }

  /**
   * The provider failures made from `from` until `to`, oldest first: failed,
   * not a test, not already sent again. The database filters them, so a long
   * window of other sends is never read.
   */
  listProviderFailures(from: Date, to: Date): Promise<SendFailure[]> {
    return this.table
      .getAll("failed", "status")
      .filter((row) => row.key("createdAt").ge(from))
      .filter((row) => row.key("createdAt").lt(to))
      .filter((row) => row.key("isTest").ne(true))
      .filter((row) => row.key("stage").ne(RESOLVED_STAGE))
      .orderBy("createdAt", "asc")
      .pluck(...SEND_FAILURE_FIELDS)
      .run();
  }

  private inScope(scope: SendScope): Stream<MailingSend> {
    const sends = scope.templateSlug
      ? this.table.getAll(scope.templateSlug, "templateSlug")
      : this.table;
    const { to } = scope;
    const since = sends.filter((row) => row.key("createdAt").ge(scope.from));
    const until = to
      ? since.filter((row) => row.key("createdAt").lt(to))
      : since;
    return scope.isTestLeftOut
      ? until.filter((row) => row.key("isTest").ne(true))
      : until;
  }

  /** The sends of `scope`, counted per group and traits in the database. */
  async tally(scope: SendScope, group: TallyGroup): Promise<SendTally[]> {
    const rows = await this.inScope(scope)
      .map((row) => ({
        atMs: epochMs(row),
        traits: {
          key: groupKey(row, group),
          status: row.key("status"),
          hasOpens: row.key("opens").gt(0).or(row.key("clicks").gt(0)),
          hasClicks: row.key("clicks").gt(0),
          isTest: row.key("isTest").eq(true),
          isResolved: row.key("stage").eq(RESOLVED_STAGE),
        },
      }))
      .group("traits", (sends, traits) => ({
        traits,
        count: sends.count(),
        firstAtMs: sends.min("atMs"),
        lastAtMs: sends.max("atMs"),
      }))
      .run();
    return rows.map(({ traits, ...counts }) => ({
      ...traits,
      key:
        group.by === "domain" ? String(traits.key).toLowerCase() : traits.key,
      ...counts,
    }));
  }

  /** The latency of each send of `scope` that left for the provider. */
  listLatencies(scope: SendScope): Promise<LatencySample[]> {
    return this.inScope(scope)
      .filter((row) => row.key("status").ne("suppressed"))
      .pluck("createdAt", "latencyMs")
      .run();
  }

  /** The sends of `scope` that went out in another locale than they asked. */
  tallyFallbacks(scope: SendScope): Promise<FallbackTally[]> {
    return this.inScope(scope)
      .filter((row) => row.key("requestedLocale").default("").ne(""))
      .filter((row) => row.key("requestedLocale").ne(row.key("locale")))
      .map((row) => ({
        atMs: epochMs(row),
        pair: {
          requested: row.key("requestedLocale"),
          used: row.key("locale"),
        },
      }))
      .group("pair", (sends, pair) => ({
        requested: pair.key("requested"),
        used: pair.key("used"),
        count: sends.count(),
        firstAtMs: sends.min("atMs"),
      }))
      .run();
  }

  /** How many real sends were made since `since`. */
  countReal(since: Date): Promise<number> {
    return this.inScope({ from: since, to: new Date(), isTestLeftOut: true })
      .count()
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
      .pluck(...SEND_SUMMARY_FIELDS)
      .run();
  }

  /** How many sends the retention would delete with this cutoff. */
  countOlderThan(limit: Date): Promise<number> {
    return this.table
      .filter((row) => canRetire(row, limit))
      .count()
      .run();
  }

  /** The slugs of the real sends made from `from` until `to`. */
  listSentSlugs(from: Date, to: Date): Promise<string[]> {
    return this.table
      .filter((row) => row.key("createdAt").ge(from))
      .filter((row) => row.key("createdAt").lt(to))
      .filter((row) => row.key("isTest").ne(true))
      .distinct("templateSlug")
      .run();
  }
}
