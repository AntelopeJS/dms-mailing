import { randomBytes } from "node:crypto";
import {
  Context,
  Controller,
  Get,
  JSONBody,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assertValidation } from "@antelopejs/interface-api-util";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import { API_BASE_PATH } from "../constants";
import { SendModel, TemplateModel } from "../db";
import { MailingSettingsPage } from "../pages/settings/page";
import { reassignRemovedCategories } from "../services/categories";
import { readCapabilities } from "../services/provider";
import {
  getSettings,
  type MissingVariablesPolicy,
  mergeSettingsPatch,
  missingVariablesPolicy,
  saveSettings,
  WEBHOOK_SECRET_BYTES,
} from "../services/settings";
import type { MailingSettingsValues } from "../types";
import { settingsSchema } from "../validation/settings.schema";
import { retentionLimit } from "../crons/retention";

const INVALID_SETTINGS = "$dms_mailing.errors.invalid_settings";
const EVENTS_PATH = `${API_BASE_PATH}/events`;
const DEFAULT_PROVIDER_SLUG = "provider";
const FORWARDED_HOST_HEADER = "x-forwarded-host";
const FORWARDED_PROTO_HEADER = "x-forwarded-proto";
const NEXT_RUN_HOUR = 3;
const NEXT_RUN_MINUTE = 15;

/** The settings as the form reads them, with the values derived for display. */
export interface MailingSettingsResponse extends MailingSettingsValues {
  /** Where the provider posts its events; read-only. */
  webhookUrl: string;
  /** The configured provider, as the read-only provider row shows it. */
  provider: string;
  /** `blockOnMissingVariables` as the two choices the form offers. */
  missingVariables: MissingVariablesPolicy;
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

  private origin(): string {
    const { headers } = this.ctx.rawRequest;
    const host = headers[FORWARDED_HOST_HEADER];
    const proto = headers[FORWARDED_PROTO_HEADER];
    if (typeof host === "string" && host)
      return `${typeof proto === "string" && proto ? proto : "https"}://${host}`;
    return this.ctx.url.origin;
  }

  @Get("")
  async read(): Promise<MailingSettingsResponse> {
    const [values, capabilities] = await Promise.all([
      getSettings(this.tenantId),
      readCapabilities(),
    ]);
    return {
      ...values,
      webhookUrl: `${this.origin()}${EVENTS_PATH}/${providerSlug(capabilities?.name)}`,
      provider: capabilities?.name ?? "",
      missingVariables: missingVariablesPolicy(values),
    };
  }

  /**
   * Applies what the form changed. The DMS form posts only the changed
   * fields, `null` for a cleared one, so the body is a patch over the stored
   * settings, validated as a whole once merged.
   */
  @Post("")
  async write(@JSONBody() body: unknown): Promise<MailingSettingsValues> {
    const current = await getSettings(this.tenantId);
    const patch = (body ?? {}) as Record<string, unknown>;
    const values = assertValidation(
      mergeSettingsPatch(current, patch),
      (value) => settingsSchema.parse(value),
      () => INVALID_SETTINGS,
    );
    const saved = await saveSettings(this.tenantId, values);
    if ("categories" in patch)
      await this.dropRemovedCategories(values.categories);
    return saved;
  }

  /** Issues a new webhook secret; the old one stops working at once. */
  @Post("/webhook-secret/rotate")
  async rotateSecret(): Promise<{ value: string }> {
    const current = await getSettings(this.tenantId);
    const value = randomBytes(WEBHOOK_SECRET_BYTES).toString("hex");
    await saveSettings(this.tenantId, { ...current, webhookSecret: value });
    return { value };
  }

  @Get("/retention-preview")
  async retentionPreview(): Promise<RetentionPreview> {
    const raw = Number(this.ctx.url.searchParams.get("days"));
    const settings = await getSettings(this.tenantId);
    const days =
      Number.isInteger(raw) && raw > 0 ? raw : settings.logRetentionDays;
    const nextRunAt = nextRetentionRun();
    const limit = retentionLimit(days, nextRunAt);
    return {
      days,
      count: await this.sends.countOlderThan(limit),
      nextRunAt: nextRunAt.toISOString(),
    };
  }

  /** How many templates sit in each category, for the categories editor. */
  @Get("/category-usage")
  async categoryUsage(): Promise<{ counts: Record<string, number> }> {
    const templates = await this.templates.getAll();
    const counts: Record<string, number> = {};
    for (const template of templates) {
      if (!template.category) continue;
      counts[template.category] = (counts[template.category] ?? 0) + 1;
    }
    return { counts };
  }

  /**
   * A deleted category must not leave templates pointing at nothing: they fall
   * back to no category.
   */
  private async dropRemovedCategories(
    categories: MailingSettingsValues["categories"],
  ): Promise<void> {
    const templates = await this.templates.getAll();
    const orphaned = reassignRemovedCategories(templates, categories);
    for (const id of orphaned) {
      await this.templates.update(id, { category: "" });
    }
  }
}
