import {
  Context,
  Controller,
  Get,
  JSONBody,
  Parameter,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { API_BASE_PATH, HTTP_NOT_FOUND } from "../constants";
import type { TemplateChange } from "../engine";
import {
  type MailingTemplate,
  TemplateModel,
  TemplateVersionModel,
} from "../db";
import { TemplatesPageController } from "../pages/templates";
import {
  displayName,
  parseVersionVariables,
  pendingChanges,
  restoreVersionAsDraft,
} from "../services/templates";
import type { VariableDefinition } from "../types";
import {
  restoreVersionSchema,
  versionNumberSchema,
} from "../validation/templates.schema";
import { assertCurrentDraft } from "./templates";

const NOT_FOUND = "$dms_mailing.errors.template_not_found";
const VERSION_NOT_FOUND = "$dms_mailing.errors.version_not_found";

export interface TemplateVersionSummary {
  version: number;
  publishedAt: Date;
  publishedBy: string;
  locales: string;
  changes: TemplateChange[];
  /** The declarations the version shipped with. */
  variables: VariableDefinition[];
}

export interface RestoredVersion {
  restored: number;
  /** The draft revision the editor carries on with. */
  revision: number;
  changes: TemplateChange[];
}

/** A template's published versions: its history, and restoring one. */
export class TemplateVersionsController extends Controller(
  `${API_BASE_PATH}/templates`,
) {
  @Context()
  declare ctx: RequestContext;

  @AuthUserWithPermission(TemplatesPageController)
  declare user: User;

  @TenantScopedModel(TemplateModel)
  declare templates: TemplateModel;

  @TenantScopedModel(TemplateVersionModel)
  declare versions: TemplateVersionModel;

  private async requireTemplate(id: string): Promise<MailingTemplate> {
    const template = await this.templates.get(id);
    assert(template, HTTP_NOT_FOUND, NOT_FOUND);
    return template;
  }

  @Get("/:id/versions")
  async history(
    @Parameter("id", "param") id: string,
  ): Promise<{ versions: TemplateVersionSummary[] }> {
    await this.requireTemplate(id);
    const rows = await this.versions.listForTemplate(id);
    return {
      versions: rows.map((row) => ({
        version: row.version,
        publishedAt: row.publishedAt,
        publishedBy: row.publishedBy,
        locales: row.locales,
        changes: JSON.parse(row.json_changes || "[]") as TemplateChange[],
        variables: parseVersionVariables(row),
      })),
    };
  }

  /**
   * Copies a published version, content and declarations, into the draft:
   * customers keep the live version until the normal review publishes it.
   * Like a save, it is refused behind a draft saved elsewhere.
   */
  @Post("/:id/versions/:version/restore")
  async restore(
    @Parameter("id", "param") id: string,
    @Parameter("version", "param") version: string,
    @JSONBody() body: unknown,
  ): Promise<RestoredVersion> {
    const { revision } = assertValidation(body ?? {}, (value) =>
      restoreVersionSchema.parse(value),
    );
    const number = assertValidation(
      version,
      (value) => versionNumberSchema.parse(value),
      () => VERSION_NOT_FOUND,
      HTTP_NOT_FOUND,
    );
    const template = await this.requireTemplate(id);
    assertCurrentDraft(template, revision);
    const row = await this.versions.getVersion(id, number);
    assert(row, HTTP_NOT_FOUND, VERSION_NOT_FOUND);
    const next = await restoreVersionAsDraft(
      getRequestTenantId(this.ctx),
      template,
      row,
      displayName(this.user),
    );
    const saved = await this.requireTemplate(id);
    return { restored: number, revision: next, changes: pendingChanges(saved) };
  }
}
