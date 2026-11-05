---
covers:
  - packages/dms-mailing/src/db/models/templates.model.ts
  - packages/dms-mailing/src/db/models/template-versions.model.ts
  - packages/dms-mailing/src/db/tables/templates.table.ts
  - packages/dms-mailing/src/db/tables/template-versions.table.ts
  - packages/dms-mailing/src/validation/templates.schema.ts
  - packages/dms-mailing/frontend-vue/app/utils/categories.ts
  - packages/dms-mailing/frontend-vue/app/utils/clone.ts
  - packages/dms-mailing/frontend-vue/app/utils/send-snippet.ts
  - packages/dms-mailing/src/pages/templates.ts
  - packages/dms-mailing/src/data/templates-table.ts
  - packages/dms-mailing/src/data/displays.ts
  - packages/dms-mailing/src/data/locale-fallback.ts
  - packages/dms-mailing/src/data/body.ts
  - packages/dms-mailing/src/data/read-only-routes.ts
  - packages/dms-mailing/src/data/index.ts
  - packages/dms-mailing/src/data-types/**
  - packages/dms-mailing/src/routes/templates.ts
  - packages/dms-mailing/src/services/templates.ts
  - packages/dms-mailing/src/services/catalog.ts
  - packages/dms-mailing/src/services/categories.ts
  - packages/dms-mailing/src/services/starters.ts
  - packages/dms-mailing/src/services/template-attention.ts
  - packages/dms-mailing/src/services/template-stats.ts
  - packages/dms-mailing/src/services/localized-text.ts
  - packages/dms-mailing/frontend-vue/app/components/TemplateGallery.vue
  - packages/dms-mailing/frontend-vue/app/components/TemplateCard.vue
  - packages/dms-mailing/frontend-vue/app/components/TemplateDrawer.vue
  - packages/dms-mailing/frontend-vue/app/components/NewTemplateModal.vue
  - packages/dms-mailing/frontend-vue/app/components/NewTemplateSourceTile.vue
  - packages/dms-mailing/frontend-vue/app/components/StarterGallery.vue
  - packages/dms-mailing/frontend-vue/app/components/DuplicateModal.vue
  - packages/dms-mailing/frontend-vue/app/components/CategoryLabel.vue
  - packages/dms-mailing/frontend-vue/app/components/CategoryInput.vue
  - packages/dms-mailing/frontend-vue/app/components/TemplatePreviewFrame.vue
  - packages/dms-mailing/frontend-vue/app/build/**
  - packages/dms-mailing/frontend-vue/app/composables/useTemplateDrawer.ts
  - packages/dms-mailing/frontend-vue/app/composables/useTemplateCategories.ts
  - packages/dms-mailing/frontend-vue/app/plugins/template-gallery-display.ts
  - packages/dms-mailing/frontend-vue/app/utils/gallery.ts
  - packages/dms-mailing/frontend-vue/app/utils/lifecycle.ts
  - packages/dms-mailing/frontend-vue/app/utils/starters.ts
  - packages/dms-mailing/frontend-vue/app/utils/template-attention.ts
  - packages/dms-mailing/frontend-vue/app/utils/slug.ts
docs:
  - packages/dms-mailing/docs/4.usage/2.templates.md
  - packages/dms-mailing/README.md
---

# Templates

The gallery, the New template dialog, the drawer and the lifecycle of a template: slugs, copies, publish, unpublish, archive, restore and delete.

## Sub-features

- `a-slug-is-unique-trimmed-and-bounded`, `names-categories-and-sources-are-checked`, `a-copy-keeps-every-locale-variable-and-test-datum`
- `lifecycle-moves-follow-the-status`, `an-unpublished-or-archived-template-refuses-sends`, `delete-takes-only-an-archived-template-never-sent`
- `the-four-starters-arrive-as-drafts-with-variables-and-test-data`: Order confirmation, Shipping update, Password reset and Invoice available come with English and French content, declared variables and test data.
- `the-gallery-groups-by-category-and-filters-by-status`: the gallery groups templates by category in the settings order with the uncategorised last, shows each status, and the tabs hold exactly their statuses.
- `needs-attention-lists-live-templates-without-a-real-send`: the Needs attention tab holds the live templates with no real send in the last 30 days, and a real send takes a template off it.
- `the-new-template-dialog-derives-the-slug-and-creates-with-the-keyboard`: New template and the N key open a dialog that derives the slug from the name, offers the starters, and Ctrl+Enter creates the template and opens the editor.
- `the-details-drawer-opens-with-its-tabs-and-footer`: the info icon of a card opens the details drawer with the Preview, Variables, Performance and History tabs and the Test, Duplicate and Open the editor buttons.
- `the-table-display-lists-the-same-templates-as-rows`: switching from the Gallery to the Table view swaps the cards for rows with each template's name, slug, category and status, the Live, Drafts and Archived tabs leave one row each, and Gallery brings the cards back.
- `a-new-footer-has-its-links-only-for-marketing-or-no-category`: a new blank template gets the unsubscribe and preferences links in the marketing category and without a category, and a legal line alone in any other category and from a starter.

## How to get to it (user POV)

- Modules › Mailing › Templates; New template; the info icon of a card.

## Driving it with dms-control

```bash
dms-control journey "$RUN" templates
```

## Gotchas

None yet.
