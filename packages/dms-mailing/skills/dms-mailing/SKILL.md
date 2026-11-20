---
name: dms-mailing
description: Sends and manages transactional e-mail with the @antelopejs/dms-mailing module of the AntelopeJS DMS. Use when installing or configuring dms-mailing, sending a template from code with SendTemplate, shipping templates or categories as code with DeclareTemplate / DeclareTemplateCategory, importing past sends with ImportSends, reporting provider events with RecordEmailEvent or the webhook, mailing DMS notifications through the email channel, designing templates (blocks, variables, locales, versions), or debugging suppressed, refused, missing-variable or fallback-locale sends.
icon: i-lucide-mail
category: messaging
tags: [email, templates, transactional, webhook, dms-module]
---

# dms-mailing

Templates edited in the dashboard, sent by slug from code, logged with provider events.
Pages under `/modules/mailing` (owner-only): Overview, Templates, editor (`templates/:id`), Sends,
Settings, Suppression list. User docs: `docs/` of this package, published at
https://dms.antelopejs.com/docs/modules/mailing (sending from code and the webhook format: `extending`).

## When to reach for it

- Code must send an e-mail a non-developer can reword, translate or restyle: create a template, call it by slug.
  Hard-coding HTML in a route is the path this module replaces.
- Delivery must be traceable (bounces, opens, clicks) or addresses must stop receiving after a hard bounce.

## Setup

- `ajs project modules add @antelopejs/dms-mailing`, plus a module implementing `@antelopejs/interface-email`
  (`@antelopejs/nodemailer`, `config: { ethereal: true }` in dev).
- The DMS backend and renderer releases the module runs on are in the README compatibility block and in `engines["@antelopejs/dms-frontend"]` of `frontend-vue/package.json`;
  0.4 is the DMS 0.8 line. Mailing 0.6 implements `@antelopejs/interface-dms-mailing` `>=0.8.0 <0.9.0`, adding declaration and import calls;
  interface 0.9 adds `DeclareSender`; `SendTemplate` / `RecordEmailEvent` callers do not change.
- Module option: `useHtmlRender` (default `true`, DMS html-render chain; `false` = built-in standalone HTML).
- Set the DMS `clientBaseUrl`: the webhook URL and the e-mail logo are built on it.
- Per-workspace settings (sender, missing-variable guard, fallback locale, webhook secret, retention,
  categories) live on the Settings page and `GET`/`PUT /api/mailing/settings` (changed fields only).

## Send from code

```typescript
import { SendTemplate, RecordEmailEvent } from "@antelopejs/interface-dms-mailing";

const result = await SendTemplate("order-confirmed", {
  tenantId,
  to: [{ email: "ana@example.com", name: "Ana" }], // one address or an array
  locale: "fr",
  variables: { customer: { firstName: "Ana" }, order: { number: "#1042" } },
  source: "checkout", // shows as "Called from" in the template's performance
});
// result.status: queued | sent | ... | failed | suppressed; result.results[] per recipient
```

- Only the **published** version is sent; drafts go out only as tests (`[TEST]` subject, out of the figures).
- Variables are typed (`string`, `text`, `number`, `money`, `date`, `url`, `boolean`, `array`) and declared on
  the template; pass every required one.
- Don't pre-format amounts and dates per locale: pass `{ value: 987420, currency: "EUR" }` (minor units) or a
  `Date`, or an ISO string at a `date` path; the send locale formats them. Plain strings print as given.
- Files: `attachments: [{ filename, contentType?, content: Buffer }]`, the same for every recipient; at most 10 files
  and 10 MiB, else `error.code` = `attachments_too_large` before anything is sent. The log keeps name, type, size and
  SHA-256, never the bytes, so the dashboard cannot send it again (409 `no_replay_with_attachments`): resend from code.
- In-process events: `RecordEmailEvent(tenantId, { provider, messageId, type, details })`.
  HTTP: `POST <clientBaseUrl>/api/mailing/events/<provider>/<tenantId>` with header `x-mailing-webhook-secret`.
- Automation (if `interface-dms-automation` is loaded), every action taking an optional `tenantId` (empty: default
  workspace; unknown: step fails), every trigger an optional `tenantId` filter:
  - Triggers: `mailing.email-event` (test sends only with `includeTests`), `mailing.address-suppressed`,
    `mailing.address-unsuppressed` (procedure-made changes only with `includeAutomationWrites`),
    `mailing.template-published` (declarations only with `includeDeclared`), `mailing.template-status-changed`,
    `mailing.retention-purged` (once per workspace and night). Dedup on the payload's `deliveryId`.
  - Writes with `dryRun`: `mailing.send-template`, `mailing.suppress-address` (`manual`/`unsubscribe`),
    `mailing.unsuppress-address` (bounces and complaints need `force`).
  - Reads: `mailing.find-suppression`, `mailing.check-suppressions`, `mailing.get-send`, `mailing.get-template`,
    `mailing.render-template`, `mailing.send-stats`, `mailing.template-performance`, `mailing.provider-health`,
    `mailing.list-attention`. Data node: `mailing.send-log-link`.

## Ship templates as code

```typescript
import { DeclareSender, DeclareTemplate, DeclareTemplateCategory, ImportSends } from "@antelopejs/interface-dms-mailing";

export async function declareMailingContent(tenantId: string) {
  await DeclareSender({ tenantId, name: "Acme", email: "hello@acme.example" }); // a plain write: call it once, at provisioning
  await DeclareTemplateCategory({ tenantId, id: "subscriptions", label: { en: "Subscriptions", fr: "Abonnements" }, icon: "i-ph-repeat" }); // before templates naming it
  const { outcome } = await DeclareTemplate({
    tenantId, slug: "subscription-renewed", name: { en: "Subscription renewed", fr: "Abonnement renouvelé" }, category: "subscriptions",
    content: { locales: { en: { subject: "Your {{plan.name}} plan is renewed", preheader: "", blocks: [] } } },
    variables: [{ path: "plan.name", type: "string", required: true }],
    testData: { plan: { name: "Pro" } },
  }); // created | kept
}
```

- Require explicit non-blank `tenantId` for declarations and imports. Call them once per tenant, from a
  `Hook.TENANT_BEING_PROVISIONED` handler (the DMS fires it for `default` on the start that creates it, after
  `DATABASE_INITIALIZED`; dms-saas for each workspace). Never from `start()` or `DATABASE_INITIALIZED`.
- Written once: a missing slug is created and published (v1, version rows, unique slug, attention refresh: a normal
  template) → `created`; a slug the tenant already has (declared or made in the dashboard) is left as it is → `kept`.
  No fingerprint, no refresh: from its creation on, the template belongs to the tenant.
- Categories: a missing id is added → `created`; an existing one, a default included, is `kept`.
- `name` / `label` are localized texts `{ en, fr, … }` (stored `@Localized`, `en` required as fallback), never `$`
  i18n keys; each user reads, searches and sorts them in their language (`x-content-language`).
- `DeclareSender({ tenantId, email, name?, replyTo? })` writes the settings' sender (resolves `void`); call it once
  from `Hook.TENANT_BEING_PROVISIONED`, not on every boot, since it replaces what a user set. Refusals use `invalid_sender`.
- `DeclareWebhookSecret({ tenantId, secret, replaceRotated? })` resolves `{ outcome: "set" | "unchanged" | "kept" }`, never
  the secret; idempotent, and keeps a secret the owner set or rotated unless `replaceRotated`. Refusals use `invalid_webhook_secret`.
- Refusals reject with `error.code`: `invalid_template`, `unknown_category`, `empty_subject`,
  `nothing_to_publish`, `invalid_category`; invalid tenant input rejects before writes. Storage errors can occur after publication.
- `ImportSends({ tenantId, sends: [{ importId, templateSlug, to, sentAt, events }] })` writes past sends with their own
  dates (demo data, migration): no delivery, no suppression/automation/realtime; skipped when `importId` was
  already imported. Retention still applies (90 days default).

## DMS notifications by e-mail

- Mailing registers the DMS e-mail notification channel itself: nothing to call.
- A subject offers it with `email: true` (off until the user turns it on) or `email: { defaultOn: true }`;
  the user switches it in Settings › Account › Notifications.
- Send with `toUser(userId, { tenantId })`: without `tenantId` nothing is mailed (no workspace, so no sender or template).
- Literal texts only: a `$` key title or description is not mailed (only the dashboard translates). Users need a validated
  address and membership of that workspace.
- Mails go through the workspace's `dms-notification` template, declared on the first notification in the workspace's
  fallback locale and editable from then on; sends are labelled `dms-mailing:notification`.

## Gotchas

- `status: "suppressed"` = address on the suppression list (hard bounce, spam, unsubscribe, manual). Never retry.
- `marketing` templates whose footer shows unsubscribe/preferences links require `unsubscribeUrl` /
  `preferencesUrl` in `variables`; a link without URL is dropped.
- A missing locale falls back to the workspace's fallback locale (logged as `DE asked`).
- The template slug is fixed at creation: code depends on it.
- `mailing.send` permission gates every route that reaches recipients; writes publish on realtime topic `mailing:sends`.
- Overview and Sends are live pages (`live: { maxRate: 5, rememberKey: "mailing" }`) with the DMS `PageToolbar`
  (provider pill, Direct / Pause, period) under their `header` static; the send log `liveHold`s its rows.
  The period offers a comparison menu (`previous-period` default, `previous-year`, `none`); routes read
  `compareFrom` / `compareTo`, and `comparison=none` drops every delta and comparison series. Every period
  figure renders it: KPI deltas, the volume chart's dashed series, funnel steps (`previousCount`, `delta`),
  the top lists' row `delta` and the Sends stat strip (`compared`); period blocks carry `realtimeTopic: "mailing:sends"`.
- 0.4+ does not read a 0.3 database and moved the webhook path (tenant in the URL).
- nodemailer `ethereal: true` creates its account online at startup: offline, the whole project fails to
  start (nodemailer's `construct()` throws, before Mailing runs). Use a local SMTP server (Mailpit) offline.
