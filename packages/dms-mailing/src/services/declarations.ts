import { randomUUID } from "node:crypto";
import type {
  DeclarationOutcome,
  DeclareTemplateCategoryResult,
  DeclareTemplateResult,
  TemplateCategoryDeclaration,
  TemplateDeclaration,
} from "@antelopejs/interface-dms-mailing";
import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  type MailingTemplate,
  SettingsModel,
  TemplateModel,
  TemplateSlugModel,
  TemplateVersionModel,
  templateSlugIdOf,
} from "../db";
import type {
  TemplateCategory,
  TemplateContent,
  VariableDefinition,
} from "../types";
import {
  categoryDeclarationSchema,
  type ParsedCategoryDeclaration,
  type ParsedTemplateDeclaration,
  templateDeclarationSchema,
} from "../validation/declarations.schema";
import { categoriesSchema } from "../validation/settings.schema";
import { DeclarationError, parseDeclared } from "./declaration-error";
import { fingerprintOf } from "./fingerprint";
import { findCategory, getSettings, saveSettings } from "./settings";
import {
  assertSlugClaimed,
  blankFields,
  hasDraft,
  localesWithoutSubject,
  parseContent,
  parseTestData,
  parseVariables,
  publishedVersionOf,
  publishSnapshot,
  requireTemplate,
  workingContent,
  workingVariables,
} from "./templates";

/** Who a declaration's writes are shown as by default. */
const DECLARATION_AUTHOR = "system";

const LIVE_STATUS = "live";
const LOG_PREFIX = "[dms-mailing]";
const MAX_DECLARATION_ATTEMPTS = 5;

/** What a declaration fingerprints: everything a user may change after it. */
interface DeclaredTemplateState {
  name: string;
  category: string;
  content: TemplateContent;
  variables: VariableDefinition[];
  testData: Record<string, unknown>;
}

/** A declaration ready to write: validated, defaulted and fingerprinted. */
interface TemplatePlan {
  tenantId: string;
  slug: string;
  state: DeclaredTemplateState;
  author: string;
  hash: string;
}

/**
 * The values as the database gives them back: a `Date` in the test data is
 * stored as its ISO string, and the fingerprint must compare alike.
 */
const asStored = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

function planTemplate(declaration: ParsedTemplateDeclaration): TemplatePlan {
  const tenantId = declaration.tenantId ?? DEFAULT_TENANT_ID;
  const { slug } = declaration;
  const state = asStored<DeclaredTemplateState>({
    name: declaration.name,
    category: declaration.category,
    content: declaration.content as TemplateContent,
    variables: declaration.variables,
    testData: declaration.testData,
  });
  assertPublishable(state.content, slug);
  return {
    tenantId,
    slug,
    state,
    author: declaration.author ?? DECLARATION_AUTHOR,
    hash: fingerprintOf(state),
  };
}

/**
 * The fingerprint of what the template holds now, `null` when a user took it
 * out of the state a declaration leaves it in: live, with no draft waiting.
 */
function currentFingerprint(template: MailingTemplate): string | null {
  if (template.status !== LIVE_STATUS || hasDraft(template)) return null;
  return fingerprintOf({
    name: template.name,
    category: template.category ?? "",
    content: parseContent(template),
    variables: parseVariables(template),
    testData: parseTestData(template),
  });
}

function resultOf(
  template: MailingTemplate,
  outcome: DeclarationOutcome,
  version = publishedVersionOf(template),
): DeclareTemplateResult {
  return {
    templateId: template._id,
    slug: template.slug,
    outcome,
    version,
  };
}

/**
 * Inserts the template as a fresh draft of the declared content, claims its
 * slug like the dashboard's creation does. The seed is not an applied
 * declaration: any caller can finish its first publication after a crash.
 */
async function createDeclared(
  plan: TemplatePlan,
): Promise<MailingTemplate | undefined> {
  const { tenantId, slug, state, author } = plan;
  const model = GetModel(TemplateModel, tenantId);
  const settings = await getSettings(tenantId);
  assertKnownCategory(settings.categories, state.category, slug);
  const revision = randomUUID();
  const [id] = await model.insert({
    slug,
    name: state.name,
    category: state.category,
    status: "draft",
    ...blankFields(state.content),
    json_variables: JSON.stringify(state.variables),
    json_test_data: JSON.stringify(state.testData),
    updatedBy: author,
    revision,
    declarationSeedRevision: revision,
    pendingDeclaredHash: plan.hash,
  });
  const templateId = id as string;
  try {
    await assertSlugClaimed(tenantId, slug, templateId);
  } catch (error) {
    if (await model.getBySlug(slug)) return undefined;
    throw error;
  }
  return requireTemplate(model, templateId);
}

/**
 * A slug claim, not an arbitrary candidate row, decides which template won
 * concurrent creation. An unclaimed seed can be claimed by its next caller.
 */
async function declaredTemplate(
  tenantId: string,
  slug: string,
): Promise<MailingTemplate | undefined> {
  const model = GetModel(TemplateModel, tenantId);
  const claim = await GetModel(TemplateSlugModel, tenantId).get(
    templateSlugIdOf(tenantId, slug),
  );
  const winner = claim && (await model.get(claim.templateId));
  return winner || model.getBySlug(slug);
}

function isUnmodifiedSeed(template: MailingTemplate): boolean {
  return Boolean(
    template.pendingDeclaredHash &&
    template.declarationSeedRevision &&
    template.revision === template.declarationSeedRevision &&
    template.status === "draft" &&
    template.publishedVersion === 0,
  );
}

/** Finishes the stored seed, never substituting a later caller's declaration. */
async function finishSeed(
  tenantId: string,
  template: MailingTemplate,
): Promise<boolean> {
  try {
    await assertSlugClaimed(tenantId, template.slug, template._id);
  } catch (error) {
    const winner = await declaredTemplate(tenantId, template.slug);
    if (winner && winner._id !== template._id) return false;
    throw error;
  }
  const settings = await getSettings(tenantId);
  assertKnownCategory(settings.categories, template.category, template.slug);
  return Boolean(
    await publishSnapshot(
      tenantId,
      template,
      {
        content: workingContent(template),
        variables: workingVariables(template),
      },
      template.updatedBy,
      {
        declaredHash: template.pendingDeclaredHash,
        pendingDeclaredHash: "",
        declarationSeedRevision: "",
      },
    ),
  );
}

/** Why an existing template is left alone, `null` when it may be refreshed. */
function keepReason(template: MailingTemplate): string | null {
  if (!template.declaredHash) return "it was created in the dashboard";
  if (currentFingerprint(template) !== template.declaredHash)
    return "a user changed it since it was declared";
  return null;
}

async function applyToExisting(
  plan: TemplatePlan,
  template: MailingTemplate,
): Promise<DeclareTemplateResult> {
  const { tenantId, state, author } = plan;
  for (let attempt = 0; attempt < MAX_DECLARATION_ATTEMPTS; attempt++) {
    if (isUnmodifiedSeed(template)) {
      const created = await finishSeed(tenantId, template);
      if (created && template.pendingDeclaredHash === plan.hash)
        return resultOf(template, "created", 1);
    } else {
      await GetModel(TemplateVersionModel, tenantId).materialize(template);
      if (template.publishedVersion > 0 && template.declaredHash === plan.hash)
        return resultOf(template, "unchanged");
      const reason = keepReason(template);
      if (reason) {
        Logging.Info(
          `${LOG_PREFIX} Kept template "${plan.slug}" as it is: ${reason}`,
        );
        return resultOf(template, "kept");
      }
      const settings = await getSettings(tenantId);
      assertKnownCategory(settings.categories, state.category, plan.slug);
      const outcome = await publishSnapshot(tenantId, template, state, author, {
        name: state.name,
        category: state.category,
        json_test_data: JSON.stringify(state.testData),
        declaredHash: plan.hash,
      });
      if (outcome) return resultOf(template, "updated", outcome.version);
    }
    const current = await declaredTemplate(tenantId, plan.slug);
    if (!current) break;
    template = current;
  }
  throw new DeclarationError(
    "declaration_conflict",
    `Template "${plan.slug}" changed repeatedly; retry the declaration`,
  );
}

/**
 * Creates or refreshes the template a project declares from code. The rule,
 * keyed on the slug:
 *
 * - no template has the slug: it is created and published (`created`);
 * - the declaration is the one last applied: nothing is written
 *   (`unchanged`), whatever a user did to the template since;
 * - the declaration changed and the template is still live, with no draft,
 *   and holds exactly what the last declaration wrote (name, category,
 *   content, variables, test data): the new declaration is published
 *   (`updated`);
 * - otherwise (edited, unpublished, archived, a draft pending, or made in the
 *   dashboard): it is left as it is (`kept`).
 *
 * A declared template a user deleted is created again by the next call.
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
  const plan = planTemplate(declaration);
  const existing = await declaredTemplate(plan.tenantId, plan.slug);
  if (existing) return applyToExisting(plan, existing);
  const created = await createDeclared(plan);
  if (created) return applyToExisting(plan, created);
  const winner = (await declaredTemplate(
    plan.tenantId,
    plan.slug,
  )) as MailingTemplate;
  return applyToExisting(plan, winner);
}

type DeclaredCategories = Record<string, string>;

const categoryFingerprint = (category: Omit<TemplateCategory, "id">) =>
  fingerprintOf({ label: category.label, icon: category.icon });

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

async function readDeclaredCategories(
  tenantId: string,
): Promise<DeclaredCategories> {
  const row = await GetModel(SettingsModel, tenantId).get(tenantId);
  return JSON.parse(
    row?.json_declared_categories || "{}",
  ) as DeclaredCategories;
}

/** The category list once the declared category is added or relabelled. */
function withCategory(
  categories: TemplateCategory[],
  declared: TemplateCategory,
): TemplateCategory[] {
  const isPresent = Boolean(findCategory(categories, declared.id));
  const next = isPresent
    ? categories.map((category) =>
        category.id === declared.id ? declared : category,
      )
    : [...categories, declared];
  return parseDeclared(
    categoriesSchema,
    next,
    "invalid_category",
    `category declaration "${declared.id}"`,
  ).map(({ id, label, icon }) => ({ id, label, icon }));
}

/** What a category declaration does to the stored list, by its state. */
function categoryOutcome(
  current: TemplateCategory | undefined,
  previousHash: string | undefined,
  hash: string,
): DeclarationOutcome {
  if (!current) return previousHash ? "kept" : "created";
  if (!previousHash) return "kept";
  if (previousHash === hash) return "unchanged";
  return categoryFingerprint(current) === previousHash ? "updated" : "kept";
}

const WRITING_OUTCOMES = new Set<DeclarationOutcome>(["created", "updated"]);

async function applyCategory(
  declaration: ParsedCategoryDeclaration,
): Promise<DeclareTemplateCategoryResult> {
  const tenantId = declaration.tenantId ?? DEFAULT_TENANT_ID;
  const category = {
    id: declaration.id,
    label: declaration.label,
    icon: declaration.icon,
  };
  const hash = categoryFingerprint(category);
  const settings = await getSettings(tenantId);
  const declared = await readDeclaredCategories(tenantId);
  const outcome = categoryOutcome(
    findCategory(settings.categories, category.id),
    declared[category.id],
    hash,
  );
  if (!WRITING_OUTCOMES.has(outcome)) return { id: category.id, outcome };
  const categories = withCategory(settings.categories, category);
  await saveSettings(tenantId, { ...settings, categories });
  await GetModel(SettingsModel, tenantId).update(tenantId, {
    json_declared_categories: JSON.stringify({
      ...declared,
      [category.id]: hash,
    }),
  });
  return { id: category.id, outcome };
}

/**
 * Adds or refreshes a template category a project declares from code, keyed
 * on its id: a new id is added (`created`); the declaration last applied is
 * left alone (`unchanged`); a changed declaration relabels a category still
 * as last declared (`updated`); a category a user relabelled or removed
 * since, or one that existed before any declaration (the defaults among
 * them), is left as it is (`kept`).
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
  return inTenantQueue(declaration.tenantId ?? DEFAULT_TENANT_ID, () =>
    applyCategory(declaration),
  );
}
