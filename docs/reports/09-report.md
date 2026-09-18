# Phase 9 report — categories, no more invented presets, template settings in the editor

Branch `mailing-pages`, on top of `6ee82c9`. Nothing committed.

## Gates

`set -o pipefail; pnpm lint && pnpm typecheck && pnpm knip && pnpm build && pnpm test` → exit 0.
91 backend tests (was 86), 22 layer files / 52 tests (was 46).

## One line per item

1. **Invented presets deleted.** `src/engine/presets.ts`, `PRESET_IDS`,
   `buildPresetContent`, its test and the `TemplatePreset` type are gone, along with the
   `preset` column on `mailing_templates`, its `TemplatesTableAPI` column and form field,
   `presetSchema`, and the `templates.preset.*` / `cols.preset` i18n keys. Nothing is kept
   behind a flag.
2. **The one legal minimum kept.** `blankContent(locale)` in the templates service returns
   a single `footer` block with the unsubscribe and preferences labels, localised en/fr
   with an English fallback — and nothing else: empty subject, empty preheader, no address
   prose. The old blank preset invented `"Your update"` and
   `"Antelope · Kortrijksesteenweg 12, 9000 Gent"`; both are gone. Unit-tested.
3. **Create from an existing template.** `createTemplateSchema` takes an optional
   `sourceTemplateId`; the creation modal's third field is **Start from** with `Blank`
   first, then the tenant's templates as `name · slug`. The copy goes through
   `contentFieldsOf(source)` — one copier, now used by both `initializeTemplate` and the
   `duplicate` route, which previously listed the four fields inline. An unknown id is
   refused with `404 $cms_mailing.errors.template_not_found`. Three integration tests.
4. **Categories are managed in Settings.** A custom `TemplateCategoriesType` DataType with
   a `CmsMailingCategoriesInput` component, following the `SegmentRulesType` precedent the
   plan named: a repeatable list of label + Phosphor icon name (with the icon previewed
   beside it, no picker), the derived id shown read-only. `DEFAULT_CATEGORIES` is now only
   the seed for a new tenant. Deleting a category leaves the templates that used it
   uncategorised — done in `MailingSettingsController.write` via
   `reassignRemovedCategories`, and the confirm text lives in the field's hint.
5. **A template may have no category.** `category` is optional in the schema, no longer
   `@Mandatory("new")`, and `groupByCategory` puts uncategorised rows in a trailing group
   whose heading the caller translates (`Uncategorised` / `Sans catégorie`).
6. **A Template tab in the editor rail** holds name, slug (read-only), category and
   status. **The toolbar name is now read-only text**: it was an invisible inline input,
   so it became a plain button that opens the Template tab — one discoverable place to
   rename rather than two invisible ones.
7. **The misleading label is fixed.** `templates.cols.name` read "Template" in both
   locales; it is now `Name` / `Nom`. Every other `cols.*` label reads correctly as both a
   column header and a form label (`Slug`, `Category`, `Status`, `Updated`, `Updated by`,
   `Locales`).

## What the CMS made me do differently

**`SelectType` cannot hold an editable list, so `category` needed its own DataType.**
`DefaultDataTypes.SelectType.getValidation()` builds a `z.enum` over `options.items`,
which are fixed when the page class is defined. With categories hardcoded that was
invisible; the moment the user adds one in Settings, saving a template with it would be
rejected. So `category` is a `TemplateCategoryType` whose validation is
`z.string().optional()` — the authority is the tenant's settings — with
`Is / IsNot / IsEmpty / IsNotEmpty` compare modes, so **the table filter offers
"uncategorised" as "is empty"** without a special option. Its input,
`CmsMailingCategoryInput`, fetches the live list.

**The category list had to become a fetch, not a page option.** The gallery display and
the creation modal were both handed `DEFAULT_CATEGORIES` through the page declaration,
which is serialised once at registration and so can never reflect an edit. Both now call
a new `GET /api/mailing/templates/categories`, guarded by the templates page permission
rather than `/settings` (which requires settings-manage, a permission a template editor
need not hold).

**The settings form could not have saved at all.** `settingsSchema.categories` was
`.min(1)` with no default while the form declared no `categories` field, so `CmsForm`
posted a body without it and validation rejected every save. Adding the field fixed that;
the schema now defaults to `[]` so a tenant may keep none.

## A live data-loss bug found and fixed

The data-api `edit` route **replaces** the writable fields rather than patching them: a
`PUT` body missing one nulls it. Proved against the running backend — a
`PUT …/edit?id=X` carrying only `{name}` left `slug: null, category: null`.

Phase 8's `renameTemplate` sent exactly that body, so **every template renamed from the
editor toolbar has been silently losing its slug and category** since that phase, and my
Task 5 panel would have widened the hole. `saveTemplateDetails` now sends the whole
writable set (`name`, `slug`, `category`), with the slug travelling unchanged, and an
integration test asserts the slug survives a name-and-category edit.

Two rows in the dev tenant were blanked by my own probe while isolating this; I deleted
them along with my `p9-*` fixtures, so the tenant is back to `welcome`,
`order-confirmed`, `reset-code`, `test`. Note that my probes also removed the `marketing`
category from the dev tenant's settings, which is the seed value, not user data.

## How this was verified

Against the running backend, with curl:

| Check | Result |
|---|---|
| create blank | blocks `['footer']`, subject `''`, footer text `''`, labels present, `category: None` |
| create with `sourceTemplateId` | subject copied verbatim, variables copied |
| unknown `sourceTemplateId` | `404 template_not_found` |
| `GET templates/categories` | the tenant's four categories |
| settings save adding + removing a category | `200`; list updates |
| template on a deleted category | `'legal'` → `''`, slug intact |
| partial `PUT …/edit` | slug and category nulled — the bug above |
| full `PUT …/edit` | slug kept, name and category applied |

In the browser: the gallery groups uncategorised templates last under "Uncategorised";
Settings shows "Template categories" with the rows, an "Add a category" button and the
deletion hint; the creation modal shows **Name / Slug / Category (Uncategorised) / Start
from (Blank)** — no "Template" label, no preset; the editor toolbar reads "Save" with no
`vN` and its heading opens the new **Template** tab, which shows Name, Slug, Category and
STATUS with Publish / Unpublish / Archive; renaming through that panel persisted with the
slug intact.

**Not confirmed in the browser:** opening either `USelect` listbox — the "Start from"
list and the category picker — because nested overlays do not respond to scripted pointer
events in this environment, as in phases 8 and 2b. Both are populated from calls I
verified separately (`listTemplates` returns all six templates from inside the page;
`listCategories` returns the tenant's four), and the write path behind the category
picker is covered by the passing slug-preservation test. They want a human pass.

**Status is not a dirty-saved field.** The plan asked for name, category and status to
"save with the content". Name and category do. Status does not: `publish` / `unpublish` /
`archive` are discrete transitions with side effects — publishing stamps `publishedAt` —
and the table's `status` column is `AccessMode.ReadOnly`, so it is not writable through
`edit` at all. The panel therefore shows the current status as a badge with the three
transition buttons, which apply immediately, and a line saying so. Turning that into a
free-form select would have meant either inventing a fourth route or losing
`publishedAt`.
