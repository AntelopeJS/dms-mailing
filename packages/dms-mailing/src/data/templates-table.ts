import {
  Controller,
  HTTPResult,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assertValidation } from "@antelopejs/interface-api-util";
import {
  DataController,
  type DataControllerCallback,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Filter,
  type FilterFunction,
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
import { DefaultDisplays } from "@antelopejs/interface-dms/base/table-view";
import { ReadonlyBehaviorType } from "@antelopejs/interface-dms/base/types";
import {
  ARCHIVED_STATUS,
  HTTP_BAD_REQUEST,
  HTTP_CONFLICT,
  HTTP_NOT_FOUND,
  HTTP_UNPROCESSABLE,
  MAX_NAME_LENGTH,
  MAX_SLUG_LENGTH,
  TABLES_BASE_PATH,
} from "../constants";
import { TemplateCategoryType } from "../data-types";
import { footerForCategory } from "../engine";
import {
  MailingTemplate,
  SendModel,
  TemplateModel,
  TemplateVersionModel,
} from "../db";
import { findCategory, getSettings } from "../services/settings";
import { findStarter, starterFields } from "../services/starters";
import { refreshTemplateAttention } from "../services/template-attention";
import {
  assertSlugClaimed,
  blankContent,
  blankFields,
  contentFieldsOf,
  displayName,
  initializeTemplate,
  releaseTemplateSlugs,
} from "../services/templates";
import type { TemplateCategory } from "../types";

import { createTemplateSchema } from "../validation/templates.schema";
import { parseBody } from "./body";
import {
  CategoryDisplay,
  LocaleChipsDisplay,
  TemplateNameDisplay,
} from "./displays";

const DUPLICATE_SLUG = "$dms_mailing.errors.duplicate_slug";
const SLUG_IMMUTABLE = "$dms_mailing.errors.slug_immutable";
const SOURCE_NOT_FOUND = "$dms_mailing.errors.template_not_found";
const STARTER_NOT_FOUND = "$dms_mailing.errors.starter_not_found";
const INVALID_TEMPLATE = "$dms_mailing.errors.invalid_template";
const UNKNOWN_CATEGORY = "$dms_mailing.errors.unknown_category";
const TEMPLATE_IN_USE = "$dms_mailing.errors.template_in_use";
const TEMPLATE_WAS_SENT = "$dms_mailing.errors.template_was_sent";
const MIN_NAME_LENGTH = 1;
const CREATE_ONLY = { edit: ReadonlyBehaviorType.disabled };
/**
 * Read-only columns render as empty dashes on the create form and as raw
 * internal values on the edit one: a template's name, slug and category are
 * the only fields worth asking for.
 */
const NEVER_IN_FORMS = {
  new: ReadonlyBehaviorType.hidden,
  edit: ReadonlyBehaviorType.hidden,
};

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

interface TemplateSeed {
  sourceTemplateId?: string;
  starterId?: string;
  category?: string;
}

/** The content fields a creation starts from: a copy, a starter or a blank page. */
async function seedFields(
  tenantId: string,
  seed: TemplateSeed,
  fallbackLocale: string,
): Promise<Partial<MailingTemplate>> {
  const source = await resolveSource(tenantId, seed.sourceTemplateId);
  if (source) return contentFieldsOf(source);
  if (!seed.starterId) {
    return blankFields(
      footerForCategory(blankContent(fallbackLocale), seed.category),
    );
  }
  const starter = findStarter(seed.starterId);
  if (!starter) throw new HTTPResult(HTTP_NOT_FOUND, STARTER_NOT_FOUND);
  return starterFields(starter, fallbackLocale);
}

const isBlank = (value: unknown) =>
  value === undefined || value === null || value === "";

/** A category is left empty or picked among the ones the settings declare. */
function assertKnownCategory(
  categories: TemplateCategory[],
  category: unknown,
): void {
  if (isBlank(category)) return;
  if (typeof category === "string" && findCategory(categories, category)) {
    return;
  }
  throw new HTTPResult(HTTP_UNPROCESSABLE, UNKNOWN_CATEGORY);
}

/** The creation's seed, and the body to store: slug and name trimmed. */
function parseCreation(body: Buffer | string) {
  const raw = parseBody(body);
  const seed = assertValidation(
    raw,
    (value) => createTemplateSchema.parse(value),
    () => INVALID_TEMPLATE,
    HTTP_BAD_REQUEST,
  );
  const normalized = JSON.stringify({
    ...raw,
    slug: seed.slug,
    name: seed.name,
  });
  return { seed, normalized };
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
      const { seed, normalized } = parseCreation(body);
      const tenantId = getRequestTenantId(ctx);
      const model = GetModel(TemplateModel, tenantId);
      if (await model.getBySlug(seed.slug)) {
        throw new HTTPResult(HTTP_CONFLICT, DUPLICATE_SLUG);
      }
      const settings = await getSettings(tenantId);
      assertKnownCategory(settings.categories, seed.category);
      const fields = await seedFields(tenantId, seed, settings.fallbackLocale);
      const ids = (await base.func.call(
        this,
        ctx,
        params,
        normalized,
        ...rest,
      )) as string[];
      const templateId = ids[0] as string;
      await assertSlugClaimed(tenantId, seed.slug, templateId);
      const user = await authenticateTenantRequest(ctx);
      await initializeTemplate(tenantId, templateId, displayName(user), fields);
      return ids;
    },
  };
}

/** Whether a template was ever sent, a test included. */
async function wasSent(sends: SendModel, slug: string): Promise<boolean> {
  const count = await sends.table.getAll(slug, "templateSlug").count().run();
  return count > 0;
}

/**
 * Why a template cannot go for good, `null` when it can: archived first
 * (archiving explains what stops working), and never sent, since the send log
 * renders past sends from it and a freed slug would inherit their figures.
 */
async function deleteRefusal(
  tenantId: string,
  template: MailingTemplate,
): Promise<string | null> {
  if (template.status !== ARCHIVED_STATUS) return TEMPLATE_IN_USE;
  const isSent = await wasSent(GetModel(SendModel, tenantId), template.slug);
  return isSent ? TEMPLATE_WAS_SENT : null;
}

/** The fields of an edit the guard checks. */
interface TemplateEdit {
  slug?: unknown;
  category?: unknown;
  name?: unknown;
}

/** The field a refused blank name is reported under. */
const BLANK_NAME = { message: INVALID_TEMPLATE, field: "name" };

/** What a guard does once the write it let through is done. */
type AfterWrite = () => Promise<void>;

/** Only an archived template never sent can go. */
export async function assertDeletable(
  tenantId: string,
  model: TemplateModel,
  ids: string[],
): Promise<void> {
  for (const id of ids) {
    const template = await model.get(id);
    const refusal = template && (await deleteRefusal(tenantId, template));
    if (refusal) throw new HTTPResult(HTTP_CONFLICT, refusal);
  }
}

/** A deleted template takes its published versions with it. */
export function afterDelete(tenantId: string, ids: string[]): AfterWrite {
  return async () => {
    const versions = GetModel(TemplateVersionModel, tenantId).table;
    await Promise.all(
      ids.map((id) => versions.getAll(id, "templateId").delete().run()),
    );
    await releaseTemplateSlugs(tenantId, ids);
    await refreshTemplateAttention(tenantId);
  };
}

/**
 * Sends resolve templates by slug and only the create paths claim it, so a
 * slug never changes once set; a category must be one the settings declare,
 * and a name holds more than spaces.
 */
export async function assertEditable(
  tenantId: string,
  body: TemplateEdit,
  current: Pick<MailingTemplate, "slug">,
): Promise<void> {
  if (body.slug !== undefined && body.slug !== current.slug)
    throw new HTTPResult(HTTP_CONFLICT, SLUG_IMMUTABLE);
  if (typeof body.name === "string" && !body.name.trim())
    throw new HTTPResult(HTTP_BAD_REQUEST, BLANK_NAME);
  const { categories } = await getSettings(tenantId);
  assertKnownCategory(categories, body.category);
}

/** Stores an edited name trimmed, once the edit is written. */
export function afterEdit(
  model: TemplateModel,
  id: string,
  name: unknown,
): AfterWrite | undefined {
  if (typeof name !== "string" || name === name.trim()) return undefined;
  return async () => {
    await model.update(id, { name: name.trim() });
  };
}

/** The templates the attention refresh flagged. */
const isFlagged: FilterFunction<Record<string, unknown>> = (_context, proxy) =>
  proxy.default(false).eq(true);

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

  @TenantScopedModel(SendModel)
  declare sends: SendModel;

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
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  @Column({
    name: "$dms_mailing.templates.cols.name",
    type: new DefaultDataTypes.StringType({
      minLength: MIN_NAME_LENGTH,
      maxLength: MAX_NAME_LENGTH,
    }),
    display: new TemplateNameDisplay({}),
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
    type: new DefaultDataTypes.StringType({ maxLength: MAX_SLUG_LENGTH }),
    readonlyBehavior: CREATE_ONLY,
    display: new DefaultDisplays.MonoDisplay({ copy: true }),
  })
  declare slug: string;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadWrite)
  @Column({
    name: "$dms_mailing.templates.cols.category",
    type: new TemplateCategoryType(),
    filterable: true,
    display: new CategoryDisplay({}),
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
    readonlyBehavior: NEVER_IN_FORMS,
    display: new DefaultDisplays.StatusPillDisplay({
      tones: { live: "success", draft: "neutral", archived: "warning" },
    }),
  })
  declare status: string;

  @Listable()
  @Sortable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.templates.cols.updatedAt",
    type: new DefaultDataTypes.DateType({}),
    readonlyBehavior: NEVER_IN_FORMS,
    display: new DefaultDisplays.RelativeDateDisplay({
      style: "day",
      byField: "updatedBy",
      byLabel: "$dms_mailing.templates.cols.updated_by",
    }),
  })
  declare updatedAt: Date;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.templates.cols.locales",
    type: new DefaultDataTypes.StringType({}),
    readonlyBehavior: NEVER_IN_FORMS,
    display: new LocaleChipsDisplay({}),
  })
  declare locales: string;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.templates.cols.updatedBy",
    type: new DefaultDataTypes.StringType({}),
    readonlyBehavior: NEVER_IN_FORMS,
  })
  declare updatedBy: string;

  @Listable()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.templates.cols.publishedVersion",
    type: new DefaultDataTypes.NumberType({}),
    readonlyBehavior: NEVER_IN_FORMS,
    isVisible: false,
  })
  declare publishedVersion: number;

  @Listable()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.templates.cols.isDraftPending",
    type: new DefaultDataTypes.BooleanType({}),
    readonlyBehavior: NEVER_IN_FORMS,
    isVisible: false,
  })
  declare isDraftPending: boolean;

  @Listable()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.templates.cols.publishedAt",
    type: new DefaultDataTypes.DateType({}),
    readonlyBehavior: NEVER_IN_FORMS,
    isVisible: false,
  })
  declare publishedAt: Date;

  /** Why the template needs a look (comma-separated), for the gallery cards. */
  @Listable()
  @Access(AccessMode.ReadOnly)
  declare attention: string;

  /** What the "Needs attention" tab filters on, whatever value it names. */
  @Filter(isFlagged)
  @Access(AccessMode.ReadOnly)
  declare needsAttention: boolean;

  /**
   * Whether an archived template was ever sent: the gallery then offers no
   * Delete, which the route would refuse. Read for archived rows only, the
   * only ones Delete is offered on.
   */
  @Listable(["slug", "status"])
  @Access(AccessMode.ReadOnly)
  get hasSends(): Promise<boolean> | boolean {
    if (this.status !== ARCHIVED_STATUS || !this.sends) return false;
    return wasSent(this.sends, this.slug);
  }
}
