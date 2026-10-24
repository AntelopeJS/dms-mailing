import type {
  DeclareTemplateCategoryResult,
  DeclareTemplateResult,
  TemplateCategoryDeclaration,
  TemplateDeclaration,
} from "@antelopejs/interface-dms-mailing";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { type MailingTemplate, TemplateModel } from "../db";
import type { TemplateCategory, TemplateContent } from "../types";
import {
  categoryDeclarationSchema,
  type ParsedCategoryDeclaration,
  type ParsedTemplateDeclaration,
  templateDeclarationSchema,
} from "../validation/declarations.schema";
import { categoriesSchema } from "../validation/settings.schema";
import { DeclarationError, parseDeclared } from "./declaration-error";
import { findCategory, getSettings, saveSettings } from "./settings";
import {
  assertSlugClaimed,
  blankFields,
  localesWithoutSubject,
  publishedVersionOf,
  publishTemplate,
  requireTemplate,
} from "./templates";

/** Who a declaration's writes are shown as by default. */
const DECLARATION_AUTHOR = "system";

function assertPublishable(content: TemplateContent, slug: string): void {
  if (!Object.keys(content.locales).length)
    throw new DeclarationError(
      "nothing_to_publish",
      `Template "${slug}" declares no locale`,
    );
  const blank = localesWithoutSubject(content);
  if (blank.length)
    throw new DeclarationError(
      "empty_subject",
      `Template "${slug}" has no subject in: ${blank.join(", ")}`,
    );
}

/** A category is left empty or one the workspace settings declare. */
function assertKnownCategory(
  categories: TemplateCategory[],
  category: string,
  slug: string,
): void {
  if (!category || findCategory(categories, category)) return;
  throw new DeclarationError(
    "unknown_category",
    `Template "${slug}" names category "${category}", which the workspace settings do not declare`,
  );
}

function resultOf(
  template: MailingTemplate,
  outcome: DeclareTemplateResult["outcome"],
): DeclareTemplateResult {
  return {
    templateId: template._id,
    slug: template.slug,
    outcome,
    version: publishedVersionOf(template),
  };
}

/**
 * Inserts the declared template as a draft, claims its slug like the
 * dashboard's creation does, and publishes it. `undefined` when a concurrent
 * call claimed the slug first.
 */
async function createDeclared(
  declaration: ParsedTemplateDeclaration,
): Promise<MailingTemplate | undefined> {
  const { tenantId, slug } = declaration;
  const model = GetModel(TemplateModel, tenantId);
  const author = declaration.author ?? DECLARATION_AUTHOR;
  const [id] = await model.insertFields({
    slug,
    name: declaration.name,
    category: declaration.category,
    status: "draft",
    ...blankFields(declaration.content as TemplateContent),
    json_variables: JSON.stringify(declaration.variables),
    json_test_data: JSON.stringify(declaration.testData),
    updatedBy: author,
  });
  const templateId = id as string;
  try {
    await assertSlugClaimed(tenantId, slug, templateId);
  } catch (error) {
    if (await model.getBySlug(slug)) return undefined;
    throw error;
  }
  await publishTemplate(
    tenantId,
    await requireTemplate(model, templateId),
    author,
  );
  return requireTemplate(model, templateId);
}

/**
 * Writes a template a project ships as code, once: call it when the tenant
 * is provisioned. A new slug is created and published (`created`). A slug the
 * tenant already has is left as it is (`kept`): from its creation on, the
 * template belongs to the tenant, and a later declaration never changes it.
 */
export async function declareTemplate(
  input: TemplateDeclaration,
): Promise<DeclareTemplateResult> {
  const declaration = parseDeclared(
    templateDeclarationSchema,
    input,
    "invalid_template",
    `template declaration "${String(input?.slug)}"`,
  );
  const { tenantId, slug } = declaration;
  assertPublishable(declaration.content as TemplateContent, slug);
  const model = GetModel(TemplateModel, tenantId);
  const existing = await model.getBySlug(slug);
  if (existing) return resultOf(existing, "kept");
  const settings = await getSettings(tenantId);
  assertKnownCategory(settings.categories, declaration.category, slug);
  const created = await createDeclared(declaration);
  if (created) return resultOf(created, "created");
  return resultOf((await model.getBySlug(slug)) as MailingTemplate, "kept");
}

/** Category declarations of one tenant run one after the other. */
const categoryQueues = new Map<string, Promise<unknown>>();

/**
 * Runs `task` after the tenant's previous category declaration: each one
 * rewrites the whole category list, and a project declaring several at once
 * must not lose any to a concurrent write.
 */
function inTenantQueue<T>(
  tenantId: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = categoryQueues.get(tenantId) ?? Promise.resolve();
  const next = previous.then(task, task);
  categoryQueues.set(
    tenantId,
    next.catch(() => undefined),
  );
  return next;
}

async function applyCategory(
  declaration: ParsedCategoryDeclaration,
): Promise<DeclareTemplateCategoryResult> {
  const { tenantId, id, label, icon } = declaration;
  const settings = await getSettings(tenantId);
  if (findCategory(settings.categories, id)) return { id, outcome: "kept" };
  const categories = parseDeclared(
    categoriesSchema,
    [...settings.categories, { id, label, icon }],
    "invalid_category",
    `category declaration "${id}"`,
  ).map((category) => ({
    id: category.id,
    label: category.label,
    icon: category.icon,
  }));
  await saveSettings(tenantId, { ...settings, categories });
  return { id, outcome: "created" };
}

/**
 * Adds a template category a project ships as code, once: call it when the
 * tenant is provisioned. A new id is added (`created`); an id the workspace
 * settings already hold, the defaults among them, is left as it is (`kept`).
 */
export function declareTemplateCategory(
  input: TemplateCategoryDeclaration,
): Promise<DeclareTemplateCategoryResult> {
  const declaration = parseDeclared(
    categoryDeclarationSchema,
    input,
    "invalid_category",
    `category declaration "${String(input?.id)}"`,
  );
  return inTenantQueue(declaration.tenantId, () => applyCategory(declaration));
}
