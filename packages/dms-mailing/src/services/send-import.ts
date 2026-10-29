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
import { getSettings } from "./settings";
import { refreshTemplateAttention } from "./template-attention";
import { isText } from "../validation/guards";

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
  isText(to) ? { email: to } : to;

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
          type: stored.type,
          at: stored.at,
          json_details: JSON.stringify(stored.details ?? {}),
        },
        entry,
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
        type: entry.type,
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

function sendRow(
  id: string,
  send: ParsedImportedSend,
  template: MailingTemplate,
  locale: string,
  activity: FoldedActivity,
): ImportedSendRow {
  const recipient = addressOf(send.to);
  return {
    _id: id,
    createdAt: send.sentAt,
    templateId: template._id,
    templateSlug: template.slug,
    locale,
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
  };
}

/** The templates the sends name, by slug; refused before anything is written. */
const missingTemplate = (slug: string): DeclarationError =>
  new DeclarationError(
    "template_not_found",
    `Imported sends name template "${slug}", which the workspace does not have`,
  );

async function templatesOf(
  tenantId: string,
  sends: ParsedImportedSend[],
): Promise<Map<string, MailingTemplate>> {
  const model = GetModel(TemplateModel, tenantId);
  const slugs = [...new Set(sends.map((send) => send.templateSlug))];
  const templates = new Map<string, MailingTemplate>();
  for (const slug of slugs) {
    const template = await model.getBySlug(slug);
    if (!template) throw missingTemplate(slug);
    templates.set(slug, template);
  }
  return templates;
}

/** The id an entry got, and whether this run wrote it. */
interface EntryOutcome {
  id: string;
  isImported: boolean;
}

/**
 * Writes one send: its events first, under ids derived from the send's, then
 * the send itself. A run stopped half-way leaves events no send shows yet,
 * which the next run completes; each write skips the row an earlier run
 * wrote, and a send present means it was fully imported.
 */
async function importOne(
  tenantId: string,
  send: ParsedImportedSend,
  template: MailingTemplate,
  fallbackLocale: string,
): Promise<EntryOutcome> {
  const id = importedSendIdOf(tenantId, send.importId);
  const sends = GetModel(SendModel, tenantId);
  const timeline = timelineOf(send);
  const events = GetModel(SendEventModel, tenantId);
  for (const [index, entry] of timeline.entries()) {
    await events.insertImported({
      _id: `${id}-${index}`,
      sendId: id,
      type: entry.type,
      at: entry.at,
      json_details: JSON.stringify(entry.details ?? {}),
    });
  }
  const locale = send.locale ?? fallbackLocale;
  const row = sendRow(id, send, template, locale, foldEvents(send, timeline));
  return { id, isImported: await sends.insertImported(row) };
}

/**
 * Writes past sends into the send log with their own dates and events: the
 * Overview, the template stats and the log then count them like any other.
 * An import, not a send: nothing is delivered, and no suppression, realtime
 * update, automation or notification follows. A send whose `importId` was
 * already imported is skipped untouched. The log retention applies to them
 * like to any send: one older than the workspace's retention goes at its next
 * nightly run.
 */
export async function importSends(
  input: SendImport,
): Promise<ImportSendsResult> {
  const { tenantId, sends } = parseDeclared(
    sendImportSchema,
    input,
    "invalid_import",
    "send import",
  );
  const templates = await templatesOf(tenantId, sends);
  const { fallbackLocale } = await getSettings(tenantId);
  const result: ImportSendsResult = { imported: 0, skipped: 0, sendIds: [] };
  for (const send of sends) {
    const template = templates.get(send.templateSlug);
    if (!template) throw missingTemplate(send.templateSlug);
    const { id, isImported } = await importOne(
      tenantId,
      send,
      template,
      fallbackLocale,
    );
    result.sendIds.push(id);
    if (isImported) result.imported += 1;
    else result.skipped += 1;
  }
  if (result.imported) await refreshTemplateAttention(tenantId);
  return result;
}
