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
import { TemplateModel } from "../db";
import { MailingSettingsPage } from "../pages/settings/page";
import { reassignRemovedCategories } from "../services/categories";
import { getSettings, saveSettings } from "../services/settings";
import type { MailingSettingsValues } from "../types";
import { settingsSchema } from "../validation/settings.schema";

const INVALID_SETTINGS = "$dms_mailing.errors.invalid_settings";

export class MailingSettingsController extends Controller(
  `${API_BASE_PATH}/settings`,
) {
  @Context()
  declare ctx: RequestContext;

  @AuthUserWithPermission(MailingSettingsPage)
  declare user: User;

  @TenantScopedModel(TemplateModel)
  declare templates: TemplateModel;

  @Get("")
  read(): Promise<MailingSettingsValues> {
    return getSettings(getRequestTenantId(this.ctx));
  }

  @Post("")
  async write(@JSONBody() body: unknown): Promise<MailingSettingsValues> {
    const values = assertValidation(
      body,
      (value) => settingsSchema.parse(value),
      () => INVALID_SETTINGS,
    );
    const saved = await saveSettings(getRequestTenantId(this.ctx), values);
    await this.dropRemovedCategories(values.categories);
    return saved;
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
