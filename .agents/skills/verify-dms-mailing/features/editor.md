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
  - packages/dms-mailing/src/validation/stored.schema.ts
  - packages/dms-mailing/frontend-vue/app/components/TemplateEditor.vue
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
  - packages/dms-mailing/src/services/templates.ts
  - packages/dms-mailing/src/routes/templates.ts
  - packages/dms-mailing/src/validation/templates.schema.ts
  - packages/dms-mailing/src/services/render.ts
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
- `declared-variables-write-amounts-and-dates-in-the-locale-of-the-send`: a money value, a Date and a declared date are written for the locale of the send, while other values, numbers and formatted strings go out as given.
- `footer-links-need-a-label-and-a-url-and-tokens-report-what-is-missing`: a footer link shows only with its label and its URL, an empty label removes it, and the preview names the variables the data does not carry.
- `the-editor-page-has-its-panes-toolbar-and-keyboard-shortcuts`: the editor at /modules/mailing/templates/<id> shows the blocks, outline and variables tabs, the block, test data and template tabs and the toolbar, saves with Ctrl+S, redoes with Ctrl+Y, searches the blocks with `/`, opens the publish review with Ctrl+Enter, opens the test dialog with T and goes back to Templates with Escape.
- Branding: `the-canvas-header-shows-the-logo-the-sent-e-mail-carries`: with the playground's `branding.logo.email.light` a public PNG next to the default SVG logo, the canvas header draws that PNG above the blocks, and a test send of the template carries the same URL.
- `ctrl-enter-opens-the-publish-review-and-publishing-from-it-goes-live`: Ctrl+Enter opens the review and publishes nothing, Keep editing publishes nothing, Publish v1 makes the template live as version 1 and a send carries that subject, and a later change publishes as v2 the same way.
- `the-test-dialog-sends-the-draft-to-every-address-given-as-a-test`: Test opens Send a test on the editor draft with the owner's address, an address added with Enter makes it Send 2 tests, and both receive the unpublished draft's subject behind [TEST], logged as tests, with no version published.
- `the-publish-review-blocks-an-empty-subject-until-the-subject-is-written`: the review of a draft without a subject names the empty subject as a problem and disables Publish v1; once the subject is written in the Template tab the review lets Publish v1 make it live with that subject.
- `the-device-and-preview-switches-change-the-canvas`: Mobile narrows the e-mail on the canvas from 600 to 380 pixels and Desktop widens it back; Data shows the test data in place of a token and Variables the token.
- `a-variable-declared-in-the-variables-tab-is-saved-in-the-draft`: Declare a variable takes a path, the Amount type and the Required switch, lists the variable, and the saved draft declares it as a required `money` variable.

## How to get to it (user POV)

- Modules › Mailing › Templates, a card's Edit button, `/modules/mailing/templates/<id>`.

## Driving it with dms-control

```bash
dms-control journey "$RUN" editor
```

## Gotchas

None yet.
