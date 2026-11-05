---
covers:
  - packages/dms-mailing/src/services/send.ts
  - packages/dms-mailing/src/services/status.ts
  - packages/dms-mailing/src/engine/formats.ts
  - packages/dms-mailing/src/engine/resolve.ts
  - packages/dms-mailing/src/engine/paths.ts
  - packages/dms-mailing/src/engine/tokens.ts
  - packages/dms-mailing/src/data/locale-fallback.ts
  - packages/dms-mailing/src/automation/send-template-action.ts
  - packages/interface-dms-mailing/src/index.ts
docs:
  - packages/dms-mailing/docs/5.extending.md
  - packages/dms-mailing/docs/6.faq.md
---

# Send from code

`SendTemplate` of `@antelopejs/interface-dms-mailing`: its result and aggregation, the refusals, tests and content overrides, how amounts and dates are written, and what the log shows of the language.

## Sub-features

- `send-template-reports-one-result-per-recipient-and-the-worst-status`: one result per recipient, ids of the first recipient, the worst status and first error on top, a provider that is down.
- `send-template-refuses-what-it-cannot-send`: template_not_found, no_recipient, template_not_live, a test of an archived template.
- `a-suppressed-result-names-its-reason`: the four i18n keys of the suppressed error.
- `amounts-and-dates-are-written-in-the-locale-of-the-send`: money, dates, ISO strings, numbers, list rows, the log keeping the values as passed, in en and fr.
- `test-sends-use-the-draft-and-content-overrides-change-nothing`: `[TEST] `, the draft, `content`, version numbers and the figures.
- `the-send-log-shows-the-language-asked-when-another-was-sent`: `DE asked`.
- The missing-variable guard and the fallback locale are driven in `settings` (`the-missing-variables-guard-refuses-or-sends-anyway`, `the-fallback-locale-picks-the-version-for-a-language-the-template-lacks`).

## How to get to it (user POV)

- From another module: `SendTemplate("order-confirmation", { tenantId, to, locale, variables })`; read the result in Mailing › Sends.

## Driving it with dms-control

```bash
dms-control journey "$RUN" send-from-code
```

`calling(ctx, label, "send", [slug, params])` runs the function in the playground's fixture; `{ "$date": "<ISO>" }` becomes a `Date`. The e-mails are read from the raw message files of the mail sink.

## Gotchas

- The fixture rejects with `{ name, message, code }`: `code` is `template_not_found`, `no_recipient`, `template_not_live`, `missing_variables`.
- The sink's subject summary keeps RFC 2047 words: the journeys decode the raw header.
- An automation node (`mailing.send-template`) is not driven.
