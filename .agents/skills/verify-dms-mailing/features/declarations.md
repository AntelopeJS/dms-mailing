---
covers:
  - packages/dms-mailing/src/services/declarations.ts
  - packages/dms-mailing/src/services/declaration-error.ts
  - packages/dms-mailing/src/services/sender-declaration.ts
  - packages/dms-mailing/src/services/send-import.ts
  - packages/dms-mailing/src/services/localized-text.ts
  - packages/dms-mailing/src/validation/declarations.schema.ts
docs:
  - packages/dms-mailing/docs/5.extending.md
  - packages/dms-mailing/docs/6.faq.md
---

# Declarations

`DeclareTemplate`, `DeclareTemplateCategory`, `DeclareSender` and `ImportSends`: what they write once, what they keep, how they validate, the provisioning hook and the languages of names and labels.

## Sub-features

- `declare-template-creates-publishes-once-and-keeps-what-the-workspace-has`: created at version 1, kept after a second declaration, an edit, an archive, a removed category; the author.
- `declare-template-validates-like-the-dashboard-and-publishes-nothing-on-failure`: 13 refused inputs with their codes and fields; none leaves a template.
- `declare-template-category-adds-once-and-keeps-existing-ids`: created, kept, six refusals, three declared at once.
- `declare-sender-writes-the-sender-section-and-later-edits-are-the-users`: replaces, clears, six refusals.
- `import-sends-writes-past-sends-with-their-dates-and-events-and-skips-known-ones`, `import-sends-refuses-bad-payloads-before-writing-anything`, `an-import-raises-no-bell-notification`.
- `declarations-made-when-the-workspace-is-provisioned-run-once`: the hook, through `VERIFY_MAILING_DECLARE`.
- `declared-names-and-labels-are-read-in-the-language-of-the-reader`.

## How to get to it (user POV)

- A project calls them from a `Hook.TENANT_BEING_PROVISIONED` handler; the owner finds the templates in Mailing › Templates.

## Driving it with dms-control

```bash
dms-control journey "$RUN" declarations
```

The hook journey writes the calls to a file in the run folder, starts the backend on a new empty database with `VERIFY_MAILING_DECLARE` set, and onboards the owner.

## Gotchas

- The hook journey starts on `onboard: false` and swaps `ctx.state.database`: the default tenant is created by the backend start that finds an empty database.
- The fixture's hook swallows rejections, so a refused declaration shows only as a missing template.
- `SendTemplate` and the retention sweep of imports are covered in `send-from-code` and `settings`.
