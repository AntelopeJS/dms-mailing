import { createHash } from "node:crypto";
import type {
  EmailEvent,
  ImportSendsResult,
  SendImport,
} from "@antelopejs/interface-dms-mailing";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  type ImportedSendRow,
  type MailingTemplate,
  SendEventModel,
  SendModel,
  TemplateModel,
} from "../db";
import { type SendEventType, stageOf } from "../types";
import {
  type ParsedImportedSend,
  type ParsedSendImport,
  sendImportSchema,
} from "../validation/declarations.schema";
import { DeclarationError, parseDeclared } from "./declaration-error";
import {
  applyEvent,
  errorAfter,
  isSameEvent,
  isSoftBounce,
  type SendCounters,
} from "./events";
import { fingerprintOf } from "./fingerprint";
import { inQueue } from "./serial-queue";
import { getSettings } from "./settings";
import { refreshTemplateAttention } from "./template-attention";

/** Labels an imported send in the log when its caller gives no source. */
const IMPORT_SOURCE = "import";

const ID_LENGTH = 32;
/** What an imported send without any event is taken to have reached. */
const DEFAULT_EVENT: SendEventType = "sent";
const START: SendCounters = { status: "queued", opens: 0, clicks: 0 };

type ImportedEvent = ParsedImportedSend["events"][number];

/** A send's id from its import key: the same on every run of the import. */
function importedSendIdOf(tenantId: string, importId: string): string {
  return createHash("sha256")
    .update(`${tenantId}\nimport\n${importId}`)
    .digest("hex")
    .slice(0, ID_LENGTH);
}

const addressOf = (to: ParsedImportedSend["to"]) =>
  typeof to === "string" ? { email: to } : to;

/** Chronological events, with the webhook's retry deduplication rules. */
function timelineOf(send: ParsedImportedSend): ImportedEvent[] {
  if (!send.events.length) return [{ type: DEFAULT_EVENT, at: send.sentAt }];
  const timeline: ImportedEvent[] = [];
  for (const entry of [...send.events].sort(
    (left, right) => +left.at - +right.at,
  )) {
    const repeated = timeline.some((stored) =>
      isSameEvent(
        {
          type: stored.type as SendEventType,
          at: stored.at,
          json_details: JSON.stringify(stored.details ?? {}),
        },
        { ...entry, type: entry.type as SendEventType },
      ),
    );
    if (!repeated) timeline.push(entry);
  }
  return timeline;
}

/** The send's columns once its events are applied, as a webhook would. */
interface FoldedActivity extends SendCounters {
  error?: string;
  isSoftBounce?: boolean;
  lastEventAt: Date;
}

function foldEvents(
  send: ParsedImportedSend,
  timeline: ImportedEvent[],
): FoldedActivity {
  return timeline.reduce<FoldedActivity>(
    (activity, entry) => {
      const event: EmailEvent = {
        provider: send.provider ?? IMPORT_SOURCE,
        messageId: send.providerMessageId ?? "",
        type: entry.type as SendEventType,
        at: entry.at,
        details: entry.details,
      };
      const counters = applyEvent(activity, event.type);
      return {
        ...counters,
        error:
          errorAfter(event, activity.status, counters.status) ?? activity.error,
        isSoftBounce:
          event.type === "bounced"
            ? isSoftBounce(event)
            : activity.isSoftBounce,
        lastEventAt: entry.at,
      };
    },
    { ...START, lastEventAt: send.sentAt },
  );
}

/** What one import run writes with: the same for every entry. */
interface ImportRun {
  tenantId: string;
  scope?: string;
  isReplacing: boolean;
  fallbackLocale: string;
}

/**
 * What an entry is remembered by: a replacing run rewrites a send whose
 * entry, or scope, changed since. Dates fingerprint as their ISO strings.
 */
function entryHashOf(run: ImportRun, send: ParsedImportedSend): string {
  return fingerprintOf(
    JSON.parse(JSON.stringify({ scope: run.scope ?? "", send })) as unknown,
  );
}

function sendRow(
  id: string,
  run: ImportRun,
  send: ParsedImportedSend,
  template: MailingTemplate,
  activity: FoldedActivity,
): ImportedSendRow {
  const recipient = addressOf(send.to);
  return {
    _id: id,
    createdAt: send.sentAt,
    templateId: template._id,
    templateSlug: template.slug,
    locale: send.locale ?? run.fallbackLocale,
    requestedLocale: send.locale ?? "",
    templateVersion: template.publishedVersion,
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    status: activity.status,
    stage: stageOf(activity.status),
    provider: send.provider,
    providerMessageId: send.providerMessageId,
    latencyMs: null,
    error: activity.error || undefined,
    source: send.source ?? IMPORT_SOURCE,
    json_variables: JSON.stringify(send.variables),
    opens: activity.opens,
    clicks: activity.clicks,
    lastEventAt: activity.lastEventAt,
    isTest: send.isTest,
    isSoftBounce: activity.isSoftBounce,
    importScope: run.scope,
    importHash: entryHashOf(run, send),
  };
}

/** The templates the sends name, by slug; refused before anything is written. */
async function templatesOf(
  tenantId: string,
  sends: ParsedImportedSend[],
): Promise<Map<string, MailingTemplate>> {
  const model = GetModel(TemplateModel, tenantId);
  const slugs = [...new Set(sends.map((send) => send.templateSlug))];
  const templates = new Map<string, MailingTemplate>();
  for (const slug of slugs) {
    const template = await model.getBySlug(slug);
    if (!template)
      throw new DeclarationError(
        "template_not_found",
        `Imported sends name template "${slug}", which the workspace does not have`,
      );
    templates.set(slug, template);
  }
  return templates;
}

/** What a run did with an entry. */
type EntryResult = "imported" | "replaced" | "skipped";

/** The id an entry got, and what this run did with it. */
interface EntryOutcome {
  id: string;
  result: EntryResult;
}

/**
 * Removes an imported send and its whole timeline, events first: a run
 * stopped half-way leaves the send, which the next replacing run handles
 * again.
 */
async function removeImported(tenantId: string, id: string): Promise<void> {
  await GetModel(SendEventModel, tenantId).deleteBySend(id);
  await GetModel(SendModel, tenantId).delete(id);
}

/**
 * Writes one send: its events first, under ids derived from the send's, then
 * the send itself. A run stopped half-way leaves events no send shows yet,
 * which the next run completes; a send present means it was fully imported.
 * A replacing run starts from an empty timeline instead, since what is left
 * may come from an earlier payload.
 */
async function writeImported(
  id: string,
  run: ImportRun,
  send: ParsedImportedSend,
  template: MailingTemplate,
): Promise<boolean> {
  const { tenantId } = run;
  const timeline = timelineOf(send);
  const events = GetModel(SendEventModel, tenantId);
  if (run.isReplacing) await events.deleteBySend(id);
  for (const [index, entry] of timeline.entries()) {
    await events.insertImported({
      _id: `${id}-${index}`,
      sendId: id,
      type: entry.type as SendEventType,
      at: entry.at,
      json_details: JSON.stringify(entry.details ?? {}),
    });
  }
  const row = sendRow(id, run, send, template, foldEvents(send, timeline));
  return GetModel(SendModel, tenantId).insertImported(row);
}

async function importOne(
  run: ImportRun,
  send: ParsedImportedSend,
  template: MailingTemplate,
): Promise<EntryOutcome> {
  const id = importedSendIdOf(run.tenantId, send.importId);
  const existing = await GetModel(SendModel, run.tenantId).get(id);
  if (!existing) {
    const isWritten = await writeImported(id, run, send, template);
    return { id, result: isWritten ? "imported" : "skipped" };
  }
  if (!run.isReplacing || existing.importHash === entryHashOf(run, send))
    return { id, result: "skipped" };
  await removeImported(run.tenantId, id);
  await writeImported(id, run, send, template);
  return { id, result: "replaced" };
}

/** Removes the sends of the scope this run no longer lists; how many went. */
async function removeUnlisted(
  run: ImportRun,
  listed: Set<string>,
): Promise<number> {
  const stored = await GetModel(SendModel, run.tenantId).listImported(
    run.scope as string,
  );
  const unlisted = stored.filter((send) => !listed.has(send._id));
  for (const send of unlisted) await removeImported(run.tenantId, send._id);
  return unlisted.length;
}

async function runImport(input: ParsedSendImport): Promise<ImportSendsResult> {
  const { tenantId, sends } = input;
  const templates = await templatesOf(tenantId, sends);
  const { fallbackLocale } = await getSettings(tenantId);
  const run: ImportRun = {
    tenantId,
    scope: input.scope,
    isReplacing: input.replace,
    fallbackLocale,
  };
  const result: ImportSendsResult = {
    imported: 0,
    replaced: 0,
    skipped: 0,
    removed: 0,
    sendIds: [],
  };
  for (const send of sends) {
    const template = templates.get(send.templateSlug) as MailingTemplate;
    const outcome = await importOne(run, send, template);
    result.sendIds.push(outcome.id);
    result[outcome.result] += 1;
  }
  if (run.isReplacing)
    result.removed = await removeUnlisted(run, new Set(result.sendIds));
  if (result.imported || result.replaced || result.removed)
    await refreshTemplateAttention(tenantId);
  return result;
}

/** Runs of one scope of a tenant's import go one at a time. */
const importQueueKey = (tenantId: string, scope: string): string =>
  `${tenantId}\nimport\n${scope}`;

/**
 * Writes past sends into the send log with their own dates and events: the
 * Overview, the template stats and the log then count them like any other.
 * An import, not a send: nothing is delivered, and no suppression, realtime
 * update, automation or notification follows. A send whose `importId` was
 * already imported is skipped untouched, unless a replacing run (`replace`
 * with a `scope`) finds its entry changed: it is then rewritten, and the
 * sends of the scope the run no longer lists are removed. Live sends and
 * other scopes are never touched. The log retention applies to them like to
 * any send: one older than the workspace's retention goes at its next
 * nightly run.
 */
export async function importSends(
  input: SendImport,
): Promise<ImportSendsResult> {
  const parsed = parseDeclared(
    sendImportSchema,
    input,
    "invalid_import",
    "send import",
  );
  if (!parsed.scope) return runImport(parsed);
  return inQueue(importQueueKey(parsed.tenantId, parsed.scope), () =>
    runImport(parsed),
  );
}
