---
covers:
  - packages/dms-mailing/src/crons/index.ts
  - packages/dms-mailing/src/crons/jobs.ts
  - packages/dms-mailing/src/routes/settings.ts
  - packages/dms-mailing/src/services/settings.ts
  - packages/dms-mailing/src/services/categories.ts
  - packages/dms-mailing/src/pages/settings/**
  - packages/dms-mailing/src/validation/settings.schema.ts
  - packages/dms-mailing/src/types/settings.ts
  - packages/dms-mailing/src/data-types/**
  - packages/dms-mailing/src/crons/retention.ts
  - packages/dms-mailing/src/db/models/settings.model.ts
  - packages/dms-mailing/src/db/tables/settings.table.ts
  - packages/dms-mailing/src/db/models/webhook-status.model.ts
  - packages/dms-mailing/frontend-vue/app/components/CategoriesInput.vue
  - packages/dms-mailing/frontend-vue/app/components/CategoryInput.vue
  - packages/dms-mailing/frontend-vue/app/components/CategoryLabel.vue
  - packages/dms-mailing/frontend-vue/app/components/LocaleSelect.vue
  - packages/dms-mailing/frontend-vue/app/components/RetentionInput.vue
  - packages/dms-mailing/frontend-vue/app/components/WebhookStatus.vue
docs:
  - packages/dms-mailing/docs/4.usage/5.settings.md
  - packages/dms-mailing/docs/3.configuration.md
---

# Settings

Configure › Settings: the sender, the delivery guards, the provider and webhook (secret, rotation, status, test event), the log retention with its preview, and the template categories.

## Sub-features

- `a-new-workspace-starts-on-the-documented-defaults`: every default of the Configuration table, the read-only provider and URL, the secret created on first read.
- `a-settings-write-is-a-checked-patch`: only the fields sent change, unknown and read-only fields are refused, every field's rules, null clears, a restart keeps it all.
- `the-sender-settings-decide-who-every-e-mail-comes-from`: From, name, Reply-To on the three send paths, read from the raw messages.
- `the-missing-variables-guard-refuses-or-sends-anyway`: both policies, the marketing unsubscribe URL, the dashboard real send and test send rules.
- `the-fallback-locale-picks-the-version-for-a-language-the-template-lacks`: nine locale cases against the mail sink and the send log.
- `rotating-the-webhook-secret-stops-the-old-one-at-once`: rotate, paste 31, 32, 120 and 121 characters.
- `the-test-event-reaches-the-webhook-and-touches-no-send`: the test event, the status, the test message id.
- `the-webhook-url-names-the-provider-in-lower-case-with-hyphens`: the URL's provider segment under a verification provider named `~Acme  Mail (EU)_v2!`, named `""`, and unable to answer.
- `the-webhook-url-origin-falls-back-from-the-dashboard-to-the-api-to-the-server`: the URL's origin with both base URLs, with only the API one (trailing slash dropped), with neither.
- `the-log-retention-is-bounded-and-previews-what-the-next-run-deletes`: 1 and 3650 days and one past, the preview counts and the 03:15 time.
- `categories-are-added-renamed-reordered-and-validated`, `removing-a-category-moves-its-templates-and-the-usage-counts-live-ones`: the categories API.
- Page journeys: `the-settings-page-has-five-sections-and-the-save-bar-saves-the-changes`, `the-webhook-section-shows-the-secret-rotates-it-and-tests-the-url`, `the-retention-control-previews-the-next-run-and-confirms-a-deletion`, `the-categories-editor-adds-renames-reorders-and-asks-where-templates-go`.

## How to get to it (user POV)

- Modules › Mailing › Configure › Settings (`/modules/mailing/settings`).

## Driving it with dms-control

```bash
dms-control journey "$RUN" settings
```

## Gotchas

- The page hydrates after load: a click before that does nothing, so the retention radios are clicked again until the save bar shows.
- A custom retention only reaches the form after Tab leaves the number field.
- The preview writes 1 year as 365 days.
- The webhook URL starts with the dashboard origin because the playground sets `clientBaseUrl`.
- `VERIFY_MAILING_PROVIDER=fake` replaces the e-mail provider with `playground/src/provider.ts`, whose capabilities carry `VERIFY_MAILING_PROVIDER_NAME` (none while it is unset); `VERIFY_MAILING_CLIENT_BASE_URL` and `VERIFY_MAILING_API_BASE_URL` replace the DMS answers for the two base URLs (`unset` answers nothing). The installed DMS always has a `clientBaseUrl`, so only this replacement reaches the fallbacks. Every restart takes about ten seconds, which is why each journey groups its cases.
- A new member also holds a DMS welcome notification in the bell.
