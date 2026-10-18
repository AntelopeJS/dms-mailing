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
- Mailing 0.6 requires `@antelopejs/dms` >=0.9 (interface-dms 0.7, renderer `@antelopejs/dms-frontend` 0.6);
  0.4 is the DMS 0.8 line. Mailing 0.6 implements `@antelopejs/interface-dms-mailing` `>=0.8.0 <0.9.0`, adding declaration and import calls;
  `SendTemplate` / `RecordEmailEvent` callers do not change.
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
- In-process events: `RecordEmailEvent(tenantId, { provider, messageId, type, details })`.
  HTTP: `POST <clientBaseUrl>/api/mailing/events/<provider>/<tenantId>` with header `x-mailing-webhook-secret`.
- Automation (if `interface-dms-automation` is loaded): action `mailing.send-template`, trigger `mailing.email-event`.

## Ship templates as code

```typescript
import { DeclareTemplate, DeclareTemplateCategory, ImportSends } from "@antelopejs/interface-dms-mailing";

export async function declareMailingContent(tenantId: string) {
  await DeclareTemplateCategory({ tenantId, id: "subscriptions", label: "Subscriptions", icon: "i-ph-repeat" }); // before templates naming it
  const { outcome } = await DeclareTemplate({
    tenantId, slug: "subscription-renewed", name: "Subscription renewed", category: "subscriptions",
    content: { locales: { en: { subject: "Your {{plan.name}} plan is renewed", preheader: "", blocks: [] } } },
    variables: [{ path: "plan.name", type: "string", required: true }],
    testData: { plan: { name: "Pro" } },
  }); // created | updated | unchanged | kept
}
```

- Require explicit non-blank `tenantId` for declarations and imports, including an explicitly selected default tenant.
  The application must authorize the target and establish provisioning readiness.
- For SaaS initialization, follow the consumer reference's **Initialize new SaaS workspaces** section:
  register the durable `created` consumer synchronously in `construct()`, without awaiting declarations,
  before startup reconciliation; deduplicate `operationId`, bind resources
  durably, then return a receipt. Mailing registers no consumer. `start()` is process-global, not per tenant;
  `TENANT_BEING_PROVISIONED` is prepayment and is not the durable `created` transition.
  Deployment updates/backfills require an authorized inventory and `IsWorkspaceProvisioningCommitted`, failing closed.
- Idempotent on the tenant's slug, published at once (v1, version rows, slug claim, attention refresh: a normal template).
- Rule: same declaration → `unchanged`; changed declaration → `updated` only if the template is live, has no
  draft and still holds exactly the last declaration (fingerprint on `declaredHash`); otherwise `kept`.
  A dashboard-made template under that slug is never taken over. Deleted → recreated next boot; archive instead.
- Categories: added once; a category a user relabelled/removed, or a default one, is `kept`.
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
  `compareFrom` / `compareTo`, and `comparison=none` drops every delta and comparison series.
- 0.4+ does not read a 0.3 database and moved the webhook path (tenant in the URL).
- nodemailer `ethereal: true` creates its account online at startup: offline, the whole project fails to
  start (nodemailer's `construct()` throws, before Mailing runs). Use a local SMTP server (Mailpit) offline.
