---
covers:
  - packages/dms-mailing/src/db/index.ts
  - packages/dms-mailing/src/db/models/index.ts
  - packages/dms-mailing/src/db/tables/index.ts
  - packages/dms-mailing/src/routes/index.ts
  - packages/dms-mailing/src/pages/index.ts
  - packages/dms-mailing/src/pages/module.ts
  - packages/dms-mailing/src/types/index.ts
  - packages/dms-mailing/src/types/json.ts
  - packages/dms-mailing/src/types/resolved.ts
  - packages/dms-mailing/src/types/blocks.ts
  - packages/dms-mailing/src/implementations/dms-mailing/index.ts
  - packages/dms-mailing/src/quick-actions.ts
  - packages/dms-mailing/src/routes/zod-json.ts
  - packages/dms-mailing/src/validation/guards.ts
  - packages/dms-mailing/src/validation/json.schema.ts
  - packages/dms-mailing/src/validation/json.ts
  - packages/dms-mailing/src/automation/index.ts
  - packages/dms-mailing/frontend-vue/app/composables/useMailingApi.ts
  - packages/dms-mailing/frontend-vue/app/composables/useMailingReads.ts
  - packages/dms-mailing/frontend-vue/app/plugins/column-displays.ts
  - packages/dms-mailing/frontend-vue/app/types/component.ts
  - packages/dms-mailing/frontend-vue/app/types/mailing.ts
  - packages/dms-mailing/frontend-vue/app/utils/api-error.ts
  - packages/dms-mailing/frontend-vue/app/utils/pages.ts
  - packages/dms-mailing/src/index.ts
docs:
  - packages/dms-mailing/docs/1.introduction.md
---

# Smoke

The fixed journey every verdict runs, whatever the diff touches: the introduction's "A first test send".

## Sub-features

- `smoke`: an owner creates a template from a starter, sends a test to an address, and finds it in Sends and in the mail sink.

## How to get to it (user POV)

- Modules › Mailing › Templates, New template, a starter; Test; Mailing › Sends.

## Driving it with dms-control

```bash
dms-control journey "$RUN" smoke
```

## Gotchas

None yet.
