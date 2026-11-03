---
covers:
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

## How to get to it (user POV)

- Modules › Mailing › Templates; New template; the info icon of a card.

## Driving it with dms-control

```bash
dms-control journey "$RUN" templates
```

## Gotchas

None yet.
