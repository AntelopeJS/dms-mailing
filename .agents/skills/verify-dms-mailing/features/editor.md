---
covers:
  - packages/dms-mailing/src/pages/editor.ts
  - packages/dms-mailing/src/routes/template-content.ts
  - packages/dms-mailing/src/routes/template-versions.ts
  - packages/dms-mailing/src/engine/changes.ts
  - packages/dms-mailing/src/engine/conditions.ts
  - packages/dms-mailing/src/engine/coverage.ts
  - packages/dms-mailing/src/engine/formats.ts
  - packages/dms-mailing/src/engine/index.ts
  - packages/dms-mailing/src/engine/paths.ts
  - packages/dms-mailing/src/engine/resolve.ts
  - packages/dms-mailing/src/engine/system-variables.ts
  - packages/dms-mailing/src/engine/tokens.ts
  - packages/dms-mailing/src/engine/walk.ts
  - packages/dms-mailing/frontend-vue/app/components/Editor.vue
  - packages/dms-mailing/frontend-vue/app/components/editor/**
  - packages/dms-mailing/frontend-vue/app/components/blocks/**
  - packages/dms-mailing/frontend-vue/app/components/VersionHistory.vue
  - packages/dms-mailing/frontend-vue/app/components/VersionPreview.vue
  - packages/dms-mailing/frontend-vue/app/components/TokenText.vue
  - packages/dms-mailing/frontend-vue/app/components/VariablePath.vue
  - packages/dms-mailing/frontend-vue/app/components/SystemVariables.vue
  - packages/dms-mailing/frontend-vue/app/components/LocaleSelect.vue
  - packages/dms-mailing/frontend-vue/app/composables/useBlockContext.ts
  - packages/dms-mailing/frontend-vue/app/composables/useEditor*.ts
  - packages/dms-mailing/frontend-vue/app/composables/useLocalizedDefaults.ts
  - packages/dms-mailing/frontend-vue/app/composables/useSortableList.ts
  - packages/dms-mailing/frontend-vue/app/composables/useTemplateEditor.ts
  - packages/dms-mailing/frontend-vue/app/utils/blocks/**
  - packages/dms-mailing/frontend-vue/app/utils/autocomplete.ts
  - packages/dms-mailing/frontend-vue/app/utils/changes.ts
  - packages/dms-mailing/frontend-vue/app/utils/conditions.ts
  - packages/dms-mailing/frontend-vue/app/utils/editor-checks.ts
  - packages/dms-mailing/frontend-vue/app/utils/editor-route.ts
  - packages/dms-mailing/frontend-vue/app/utils/history.ts
  - packages/dms-mailing/frontend-vue/app/utils/locales.ts
  - packages/dms-mailing/frontend-vue/app/utils/paths.ts
  - packages/dms-mailing/frontend-vue/app/utils/shortcuts.ts
  - packages/dms-mailing/frontend-vue/app/utils/system-variables.ts
  - packages/dms-mailing/frontend-vue/app/utils/testData.ts
  - packages/dms-mailing/frontend-vue/app/utils/tokens.ts
  - packages/dms-mailing/frontend-vue/app/utils/variable-types.ts
  - packages/dms-mailing/frontend-vue/app/utils/variables.ts
  - packages/dms-mailing/frontend-vue/app/utils/version-history.ts
docs:
  - packages/dms-mailing/docs/4.usage/3.editor.md
  - packages/dms-mailing/docs/5.extending.md
---

# Editor

Drafts, published versions, revisions, the history and how the blocks render.

## Sub-features

- `edits-stay-in-a-draft-until-published`, `a-stale-editor-cannot-overwrite-a-newer-draft`, `a-version-restores-as-a-draft-and-customers-stay-on-the-live-one`
- `every-block-type-renders-with-its-settings`: heading, paragraph, image, button, list, total, code, divider and footer render their text, alignment, size, link, rows and values from the test data.
- `visibility-rules-compare-a-variable-with-a-value`: a block shows only if a variable is filled, empty, equal, different, greater or lower, and a condition block shows its if branch or its else branch.
- `amounts-and-dates-are-written-in-the-locale-of-the-send`: a money value, a Date and a declared date are written for the locale of the send, while other values, numbers and formatted strings go out as given.
- `footer-links-need-a-label-and-a-url-and-tokens-report-what-is-missing`: a footer link shows only with its label and its URL, an empty label removes it, and the preview names the variables the data does not carry.
- `the-editor-page-has-its-panes-toolbar-and-keyboard-shortcuts`: the editor at /modules/mailing/templates/<id> shows the blocks, outline and variables tabs, the block, test data and template tabs and the toolbar, saves with Ctrl+S, opens the test dialog with T and goes back to Templates with Escape.

## How to get to it (user POV)

- Modules › Mailing › Templates, a card's Edit button, `/modules/mailing/templates/<id>`.

## Driving it with dms-control

```bash
dms-control journey "$RUN" editor
```

## Gotchas

None yet.
