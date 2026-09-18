import {
  Controller,
  HTTPResult,
  type RequestContext,
} from "@antelopejs/interface-api";
import {
  DataController,
  type DataControllerCallback,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  Mandatory,
  ModelReference,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { authenticateTenantRequest } from "@antelopejs/interface-dms/guards";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import {
  Column,
  Exported,
  Searchable,
  Select,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { ReadonlyBehaviorType } from "@antelopejs/interface-dms/base/types";
import { HTTP_CONFLICT, HTTP_NOT_FOUND, TABLES_BASE_PATH } from "../constants";
import { TemplateCategoryType } from "../data-types";
import { MailingTemplate, TemplateModel } from "../db";
import { getSettings } from "../services/settings";
import { displayName, initializeTemplate } from "../services/templates";

import { createTemplateSchema } from "../validation/templates.schema";
import { parseBody } from "./body";

const DUPLICATE_SLUG = "$dms_mailing.errors.duplicate_slug";
const SOURCE_NOT_FOUND = "$dms_mailing.errors.template_not_found";
const CREATE_ONLY = { edit: ReadonlyBehaviorType.disabled };
// Read-only columns render as empty dashes on the create form; the four fields
// a template is actually created from are the only ones worth asking for.
const NEVER_ON_CREATE = { new: ReadonlyBehaviorType.hidden };

const STATUS_ITEMS = ["draft", "live", "archived"].map((value) => ({
  value,
  label: `$dms_mailing.templates.status.${value}`,
}));

/** The template a creation copies from, refused rather than silently ignored. */
async function resolveSource(
  tenantId: string,
  sourceTemplateId: string | undefined,
): Promise<MailingTemplate | undefined> {
  if (!sourceTemplateId) return undefined;
  const source = await GetModel(TemplateModel, tenantId).get(sourceTemplateId);
  if (!source) throw new HTTPResult(HTTP_NOT_FOUND, SOURCE_NOT_FOUND);
  return source;
}

function withSeeding(base: DataControllerCallback): DataControllerCallback {
  return {
    ...base,
    func: async function (
      this: unknown,
      ctx: RequestContext,
      params: unknown,
      body: Buffer | string,
      ...rest: unknown[]
    ) {
      const seed = createTemplateSchema.parse(parseBody(body));
      const tenantId = getRequestTenantId(ctx);
      const existing = await GetModel(TemplateModel, tenantId).getBySlug(
        seed.slug,
      );
      if (existing) throw new HTTPResult(HTTP_CONFLICT, DUPLICATE_SLUG);
      const source = await resolveSource(tenantId, seed.sourceTemplateId);
      const ids = (await base.func.call(
        this,
        ctx,
        params,
        body,
        ...rest,
      )) as string[];
      const user = await authenticateTenantRequest(ctx);
      const settings = await getSettings(tenantId);
      await initializeTemplate(
        tenantId,
        ids[0] as string,
        settings.fallbackLocale,
        displayName(user),
        source,
      );
      return ids;
    },
  };
}

const templateRoutes = {
  ...TableViewRoutes.All,
  new: withSeeding(TableViewRoutes.New),
};

@RegisterDataController()
export class TemplatesTableAPI extends DataController(
  MailingTemplate,
  templateRoutes,
  Controller(`${TABLES_BASE_PATH}/templates`),
) {
  @ModelReference()
  @TenantScopedModel(TemplateModel)
  declare model: TemplateModel;

  @Select()
  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Select()
  @Listable()
  @Sortable()
  @Exported()
  @Searchable()
  @Mandatory("new")
  @Access(AccessMode.ReadWrite)
  @Column({
    name: "$dms_mailing.templates.cols.name",
    type: new DefaultDataTypes.StringType({}),
  })
  declare name: string;

  @Select()
  @Listable()
  @Sortable()
  @Exported()
  @Searchable()
  @Mandatory("new")
  @Access(AccessMode.ReadWrite)
  @Column({
    name: "$dms_mailing.templates.cols.slug",
    type: new DefaultDataTypes.StringType({}),
    readonlyBehavior: CREATE_ONLY,
  })
  declare slug: string;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadWrite)
  @Column({
    name: "$dms_mailing.templates.cols.category",
    type: new TemplateCategoryType(),
    filterable: true,
  })
  declare category: string;

  @Listable()
  @Sortable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.templates.cols.status",
    type: new DefaultDataTypes.SelectType({ items: STATUS_ITEMS }),
    filterable: true,
    readonlyBehavior: NEVER_ON_CREATE,
  })
  declare status: string;

  @Listable()
  @Sortable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.templates.cols.updatedAt",
    type: new DefaultDataTypes.DateType({}),
    readonlyBehavior: NEVER_ON_CREATE,
  })
  declare updatedAt: Date;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.templates.cols.locales",
    type: new DefaultDataTypes.StringType({}),
    readonlyBehavior: NEVER_ON_CREATE,
  })
  declare locales: string;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.templates.cols.updatedBy",
    type: new DefaultDataTypes.StringType({}),
    readonlyBehavior: NEVER_ON_CREATE,
  })
  declare updatedBy: string;
}
