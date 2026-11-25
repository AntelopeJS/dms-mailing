import { randomUUID } from "node:crypto";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { announce } from "../automation/emitter";
import { templatePublishedChannel } from "../automation/template-published-trigger";
import {
  type TemplateAction,
  templateStatusChangedChannel,
} from "../automation/template-status-changed-trigger";
import { HTTP_CONFLICT } from "../constants";
import {
  type MailingTemplate,
  type TemplateFields,
  TemplateModel,
} from "../db";
import { diffContents, diffVariables } from "../engine";
import type { TemplateContent, TemplateStatus } from "../types";
import { refreshTemplateAttention } from "./template-attention";
import {
  type AppliedPublish,
  parseContent,
  parseVariables,
  type PublishOutcome,
  publishedVersionOf,
  publishSnapshot,
  requireTemplate,
  workingSnapshot,
} from "./templates";

export type { TemplateAction } from "../automation/template-status-changed-trigger";

export const INVALID_TRANSITION = "$dms_mailing.errors.invalid_transition";
const DRAFT_CONFLICT = "$dms_mailing.errors.draft_conflict";
const TRANSITION_ATTEMPTS = 2;

/** The statuses each lifecycle action may start from. */
const ALLOWED_FROM: Record<TemplateAction, TemplateStatus[]> = {
  publish: ["draft", "live"],
  unpublish: ["live"],
  archive: ["draft", "live"],
  restore: ["archived"],
};

/** A lifecycle action other than a publish: it only moves the status. */
export type StatusAction = Exclude<TemplateAction, "publish">;

const TARGET_STATUS: Record<StatusAction, TemplateStatus> = {
  unpublish: "draft",
  archive: "archived",
  restore: "draft",
};

/** What a lifecycle action records besides the new status. */
const TRANSITION_FIELDS: Partial<Record<StatusAction, () => TemplateFields>> = {
  unpublish: () => ({ unpublishedAt: new Date() }),
};

const localeList = (content: TemplateContent): string[] =>
  Object.keys(content.locales);

/** Whether `action` may start from the template's status. */
export const canTransition = (
  template: MailingTemplate,
  action: TemplateAction,
): boolean => ALLOWED_FROM[action].includes(template.status);

function emitStatusChanged(
  tenantId: string,
  template: MailingTemplate,
  change: {
    status: TemplateStatus;
    action: TemplateAction;
    publishedVersion: number;
    author: string;
    revision: string;
  },
): void {
  announce(templateStatusChangedChannel.id, () => {
    templateStatusChangedChannel.emit({
      tenantId,
      templateId: template._id,
      slug: template.slug,
      previousStatus: template.status,
      status: change.status,
      action: change.action,
      publishedVersion: change.publishedVersion,
      changedBy: change.author,
      changedAt: new Date().toISOString(),
      deliveryId: `${template._id}:${change.revision}`,
    });
  });
}

function emitEditorPublish(
  tenantId: string,
  template: MailingTemplate,
  content: TemplateContent,
  outcome: AppliedPublish,
): void {
  const previousVersion = publishedVersionOf(template);
  announce(templatePublishedChannel.id, () => {
    templatePublishedChannel.emit({
      tenantId,
      templateId: template._id,
      slug: template.slug,
      version: outcome.version,
      previousVersion,
      isNewVersion: outcome.version !== previousVersion,
      previousStatus: template.status,
      changeCount: outcome.changes.length,
      locales: localeList(content),
      publishedBy: outcome.publishedBy,
      origin: "editor",
      publishedAt: outcome.publishedAt.toISOString(),
      deliveryId: `${template._id}:${outcome.revision}`,
    });
  });
}

/**
 * Ships the working content: it becomes what `SendTemplate` sends, a version
 * row keeps it for the history, and the draft is cleared. Re-publishing a
 * template whose draft changes nothing makes it live again without a version.
 * An applied publish fires `mailing.template-published`, and
 * `mailing.template-status-changed` when the template was not live.
 */
export async function publishTemplate(
  tenantId: string,
  template: MailingTemplate,
  author: string,
): Promise<PublishOutcome> {
  const draft = workingSnapshot(template);
  const outcome = await publishSnapshot(tenantId, template, draft, author);
  if (!outcome) throw new HTTPResult(HTTP_CONFLICT, DRAFT_CONFLICT);
  emitEditorPublish(tenantId, template, draft.content, outcome);
  if (template.status !== "live")
    emitStatusChanged(tenantId, template, {
      status: "live",
      action: "publish",
      publishedVersion: outcome.version,
      author,
      revision: outcome.revision,
    });
  return { version: outcome.version, changes: outcome.changes };
}

/**
 * Fires `mailing.template-published` for a template a declaration created
 * live as version 1.
 */
export function emitDeclaredPublish(
  tenantId: string,
  template: MailingTemplate,
): void {
  announce(templatePublishedChannel.id, () => {
    const content = parseContent(template);
    const changes = [
      ...diffContents({ locales: {} }, content),
      ...diffVariables([], parseVariables(template)),
    ];
    templatePublishedChannel.emit({
      tenantId,
      templateId: template._id,
      slug: template.slug,
      version: publishedVersionOf(template),
      previousVersion: 0,
      isNewVersion: true,
      previousStatus: "",
      changeCount: changes.length,
      locales: localeList(content),
      publishedBy: template.publishedBy ?? "",
      origin: "declaration",
      publishedAt: new Date(template.publishedAt ?? Date.now()).toISOString(),
      deliveryId: `${template._id}:declared`,
    });
  });
}

async function applyTransition(
  tenantId: string,
  template: MailingTemplate,
  action: StatusAction,
  author: string,
): Promise<boolean> {
  const status = TARGET_STATUS[action];
  const revision = randomUUID();
  const applied = await GetModel(TemplateModel, tenantId).updateIfCurrent(
    template,
    { status, updatedBy: author, ...TRANSITION_FIELDS[action]?.() },
    revision,
  );
  if (!applied) return false;
  await refreshTemplateAttention(tenantId);
  emitStatusChanged(tenantId, template, {
    status,
    action,
    publishedVersion: publishedVersionOf(template),
    author,
    revision,
  });
  return true;
}

/**
 * Unpublishes, archives or restores a template in one conditional write: of
 * two concurrent requests one applies, and the other finds the status moved
 * and is refused with 409. The applied change fires
 * `mailing.template-status-changed`.
 */
export async function transitionTemplate(
  tenantId: string,
  templateId: string,
  action: StatusAction,
  author: string,
): Promise<TemplateStatus> {
  const model = GetModel(TemplateModel, tenantId);
  for (let attempt = 0; attempt < TRANSITION_ATTEMPTS; attempt++) {
    const template = await requireTemplate(model, templateId);
    if (!canTransition(template, action))
      throw new HTTPResult(HTTP_CONFLICT, INVALID_TRANSITION);
    if (await applyTransition(tenantId, template, action, author))
      return TARGET_STATUS[action];
  }
  throw new HTTPResult(HTTP_CONFLICT, DRAFT_CONFLICT);
}
