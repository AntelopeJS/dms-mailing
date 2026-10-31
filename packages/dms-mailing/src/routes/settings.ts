import { randomBytes } from "node:crypto";
import {
  Context,
  Controller,
  Get,
  Post,
  Put,
  RawBody,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { GetApiBaseUrl } from "@antelopejs/interface-dms/api-base-url";
import { GetClientBaseUrl } from "@antelopejs/interface-dms/client-base-url";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import { z } from "zod";
import { API_BASE_PATH, ARCHIVED_STATUS, HTTP_BAD_REQUEST } from "../constants";
import { parseBody } from "../data/body";
import { SendModel, TemplateModel } from "../db";
import { MailingSettingsPage } from "../pages/settings/page";
import {
  categoryMoves,
  keptCategories,
  reassignRemovedCategories,
} from "../services/categories";
import { readCapabilities } from "../services/provider";
import {
  clearedToEmpty,
  getSettings,
  type MissingVariablesPolicy,
  mergeSettingsPatch,
  missingVariablesPolicy,
  saveSettings,
  WEBHOOK_SECRET_BYTES,
} from "../services/settings";
import {
  readWebhookStatus,
  sendWebhookTest,
  type WebhookTestOutcome,
} from "../services/webhook-status";
import type { MailingSettingsValues, WebhookStatus } from "../types";
import {
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  type SettingsPatch,
  settingsPatchSchema,
} from "../validation/settings.schema";
import { retentionLimit } from "../crons/retention";
import { isJsonObject } from "../validation/json";

const INVALID_SETTINGS = "$dms_mailing.errors.invalid_settings";
const CATEGORIES_REASSIGNED = "$dms_mailing.settings.categories.reassigned";
const SENDER_NAME_IGNORED = "$dms_mailing.settings.sender_name_ignored";
const WARNING_COLOR = "warning";
const EVENTS_PATH = `${API_BASE_PATH}/events`;
const DEFAULT_PROVIDER_SLUG = "provider";
const TRAILING_SLASHES = /\/+$/;
const NEXT_RUN_HOUR = 3;
const NEXT_RUN_MINUTE = 15;
const RETENTION_DAYS_PARAM = "days";

/** A settings field the form shows under another name. */
const FORM_FIELD_OF = new Map([
  ["blockOnMissingVariables", "missingVariables"],
]);

const retentionDaysSchema = z.coerce
  .number()
  .int()
  .min(MIN_RETENTION_DAYS)
  .max(MAX_RETENTION_DAYS);

/**
 * The settings as the form reads them, with the values derived for display.
 * The DMS form reads and writes localized values whole
 * (`x-content-language: *`): category labels travel with every language.
 */
export interface MailingSettingsResponse extends MailingSettingsValues {
  /** Where the provider posts its events; read-only. */
  webhookUrl: string;
  /** The configured provider, as the read-only provider row shows it. */
  provider: string;
  /** `blockOnMissingVariables` as the two choices the form offers. */
  missingVariables: MissingVariablesPolicy;
}

/** A toast the settings form shows next to its success one. */
export interface SettingsNotice {
  title: string;
  color?: string;
  params?: Record<string, unknown>;
}

export interface SettingsWriteResponse extends MailingSettingsValues {
  notice?: SettingsNotice;
}

/** What "Send a test event" did, and the webhook status after it. */
export interface WebhookTestResponse extends WebhookTestOutcome {
  status: WebhookStatus;
}

export interface RetentionPreview {
  days: number;
  /** Sends the next nightly run would delete with this retention. */
  count: number;
  nextRunAt: string;
}

function providerSlug(name: string | undefined): string {
  const slug = (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return slug || DEFAULT_PROVIDER_SLUG;
}

/** The next 03:15 the retention cron fires at, server time. */
export function nextRetentionRun(now: Date = new Date()): Date {
  const next = new Date(now);
  next.setHours(NEXT_RUN_HOUR, NEXT_RUN_MINUTE, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

/**
 * Where a provider posts the events of a tenant: the API origin, the provider
 * and the tenant in the path.
 */
function webhookUrl(
  origin: string,
  provider: string | undefined,
  tenantId: string,
): string {
  return [
    origin.replace(TRAILING_SLASHES, ""),
    EVENTS_PATH,
    `/${providerSlug(provider)}`,
    `/${encodeURIComponent(tenantId)}`,
  ].join("");
}

/** The issue of a refused write, under the form field it belongs to. */
function formIssue(issue: z.ZodIssue): z.ZodIssue {
  const [field, ...rest] = issue.path;
  const formField = FORM_FIELD_OF.get(String(field));
  return formField ? { ...issue, path: [formField, ...rest] } : issue;
}

/** A refused write: the generic message, and each issue for its field. */
function invalidSettings(error: unknown) {
  if (!(error instanceof z.ZodError)) return INVALID_SETTINGS;
  return { message: INVALID_SETTINGS, issues: error.issues.map(formIssue) };
}

function senderNotice(values: MailingSettingsValues): SettingsNotice[] {
  return values.senderName && !values.senderEmail
    ? [{ title: SENDER_NAME_IGNORED, color: WARNING_COLOR }]
    : [];
}

function reassignedNotice(count: number): SettingsNotice[] {
  return count ? [{ title: CATEGORIES_REASSIGNED, params: { count } }] : [];
}

export class MailingSettingsController extends Controller(
  `${API_BASE_PATH}/settings`,
) {
  @Context()
  declare ctx: RequestContext;

  @AuthUserWithPermission(MailingSettingsPage)
  declare user: User;

  @TenantScopedModel(TemplateModel)
  declare templates: TemplateModel;

  @TenantScopedModel(SendModel)
  declare sends: SendModel;

  private get tenantId(): string {
    return getRequestTenantId(this.ctx);
  }

  /**
   * The origin a provider reaches the event route on: the dashboard's public
   * URL (`clientBaseUrl`), whose proxy serves the route to anonymous callers
   * as a declared public endpoint; else the API origin (`apiBaseUrl`), else
   * this server's own. Always from the DMS configuration, never from
   * forwarding headers: the webhook test posts to it from the server.
   */
  private async publicOrigin(): Promise<string> {
    return (
      (await GetClientBaseUrl()) ??
      (await GetApiBaseUrl()) ??
      this.ctx.url.origin
    );
  }

  /** The address the provider posts to, as the form shows it. */
  private async providerWebhookUrl(provider?: string): Promise<string> {
    return webhookUrl(await this.publicOrigin(), provider, this.tenantId);
  }

  @Get("")
  async read(): Promise<MailingSettingsResponse> {
    const [values, capabilities] = await Promise.all([
      getSettings(this.tenantId),
      readCapabilities(),
    ]);
    return {
      ...values,
      webhookUrl: await this.providerWebhookUrl(capabilities?.name),
      provider: capabilities?.name ?? "",
      missingVariables: missingVariablesPolicy(values),
    };
  }

  /**
   * Applies what the form changed. The DMS form puts only the changed fields,
   * `null` for a cleared one, so the body is a patch over the stored settings:
   * each field sent is checked, the others are left as stored.
   */
  @Put("")
  async update(@RawBody() raw: Buffer): Promise<SettingsWriteResponse> {
    const { categories: entries, ...patch } = this.readPatch(raw);
    const current = await getSettings(this.tenantId);
    const merged = mergeSettingsPatch(current, patch);
    const categories = entries ? keptCategories(entries) : current.categories;
    const saved = await saveSettings(this.tenantId, { ...merged, categories });
    const reassigned = entries
      ? await this.reassignCategories(categories, categoryMoves(entries))
      : 0;
    const [notice] = [...reassignedNotice(reassigned), ...senderNotice(saved)];
    return { ...saved, ...(notice && { notice }) };
  }

  /** The body as a checked patch; 400 for anything else. */
  private readPatch(raw: Buffer): SettingsPatch {
    const body: unknown = parseBody(raw);
    assert(isJsonObject(body), HTTP_BAD_REQUEST, INVALID_SETTINGS);
    return assertValidation(
      clearedToEmpty(body),
      (value) => settingsPatchSchema.parse(value),
      invalidSettings,
    );
  }

  /** Issues a new webhook secret; the old one stops working at once. */
  @Post("/webhook-secret/rotate")
  async rotateSecret(): Promise<{ value: string }> {
    const current = await getSettings(this.tenantId);
    const value = randomBytes(WEBHOOK_SECRET_BYTES).toString("hex");
    await saveSettings(this.tenantId, { ...current, webhookSecret: value });
    return { value };
  }

  /** The last event the webhook accepted, and the last call it refused. */
  @Get("/webhook-status")
  async webhookStatus(): Promise<WebhookStatus> {
    return readWebhookStatus(this.tenantId);
  }

  /**
   * Posts a test event to the webhook URL the form shows, with the stored
   * secret, as a provider would. It reaches no send.
   */
  @Post("/webhook-test")
  async webhookTest(): Promise<WebhookTestResponse> {
    const [values, capabilities] = await Promise.all([
      getSettings(this.tenantId),
      readCapabilities(),
    ]);
    const url = await this.providerWebhookUrl(capabilities?.name);
    const outcome = await sendWebhookTest(url, values.webhookSecret);
    return { ...outcome, status: await readWebhookStatus(this.tenantId) };
  }

  @Get("/retention-preview")
  async retentionPreview(): Promise<RetentionPreview> {
    const days = await this.previewDays();
    const nextRunAt = nextRetentionRun();
    const limit = retentionLimit(days, nextRunAt);
    return {
      days,
      count: await this.sends.countOlderThan(limit),
      nextRunAt: nextRunAt.toISOString(),
    };
  }

  /** The `days` asked for, within the retention bounds, else the stored. */
  private async previewDays(): Promise<number> {
    const raw = this.ctx.url.searchParams.get(RETENTION_DAYS_PARAM);
    if (raw === null)
      return (await getSettings(this.tenantId)).logRetentionDays;
    return assertValidation(
      raw,
      (value) => retentionDaysSchema.parse(value),
      invalidSettings,
    );
  }

  /**
   * How many templates sit in each category, for the categories editor. An
   * archived template is left out: it no longer shows in the gallery.
   */
  @Get("/category-usage")
  async categoryUsage(): Promise<{ counts: Record<string, number> }> {
    const templates = await this.templates.getAll();
    const counts = new Map<string, number>();
    for (const template of templates) {
      if (!template.category || template.status === ARCHIVED_STATUS) continue;
      counts.set(template.category, (counts.get(template.category) ?? 0) + 1);
    }
    return { counts: Object.fromEntries(counts) };
  }

  /**
   * A deleted category must not leave templates pointing at nothing: they go
   * to the category the form moved them to, else to none.
   * @returns How many templates changed category
   */
  private async reassignCategories(
    categories: MailingSettingsValues["categories"],
    moves: ReadonlyMap<string, string>,
  ): Promise<number> {
    const templates = await this.templates.getAll();
    const changes = reassignRemovedCategories(templates, categories, moves);
    for (const { templateId, category } of changes) {
      await this.templates.updateFields(templateId, { category });
    }
    return changes.length;
  }
}
