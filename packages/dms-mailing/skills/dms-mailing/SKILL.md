---
name: dms-mailing
description: Sends and manages transactional e-mail with the @antelopejs/dms-mailing module of the AntelopeJS DMS. Use when installing or configuring dms-mailing, sending a template from code with SendTemplate, shipping templates or categories as code with DeclareTemplate / DeclareTemplateCategory, importing past sends with ImportSends, reporting provider events with RecordEmailEvent or the webhook, designing templates (blocks, variables, locales, versions), or debugging suppressed, refused, missing-variable or fallback-locale sends.
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
- Mailing 0.7.1 requires `@antelopejs/dms` >=0.11 (interface-dms 0.9, renderer `@antelopejs/dms-frontend` 0.9);
  0.7.0 is the DMS 0.10 line. It implements `@antelopejs/interface-dms-mailing` `>=0.9.0 <0.10.0`: declaration and import calls,
  and `DeclareSender` since interface 0.9; `SendTemplate` / `RecordEmailEvent` callers do not change.
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
- In-process events: `RecordEmailEvent(tenantId, { provider, messageId, type, details })`.
  HTTP: `POST <clientBaseUrl>/api/mailing/events/<provider>/<tenantId>` with header `x-mailing-webhook-secret`.
- Automation (if `interface-dms-automation` is loaded): action `mailing.send-template`, trigger `mailing.email-event`.

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
- Refusals reject with `error.code`: `invalid_template`, `unknown_category`, `empty_subject`,
  `nothing_to_publish`, `invalid_category`; invalid tenant input rejects before writes. Storage errors can occur after publication.
- `ImportSends({ tenantId, sends: [{ importId, templateSlug, to, sentAt, events }] })` writes past sends with their own
  dates (demo data, migration): no delivery, no suppression/automation/realtime; skipped when `importId` was
  already imported. Retention still applies (90 days default).

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
