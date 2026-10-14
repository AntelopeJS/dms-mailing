---
name: dms-mailing
description: Sends and manages transactional e-mail with the @antelopejs/dms-mailing module of the AntelopeJS DMS. Use when installing or configuring dms-mailing, sending a template from code with SendTemplate, reporting provider events with RecordEmailEvent or the webhook, designing templates (blocks, variables, locales, versions), or debugging suppressed, refused, missing-variable or fallback-locale sends.
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

## Gotchas

- `status: "suppressed"` = address on the suppression list (hard bounce, spam, unsubscribe, manual). Never retry.
- `marketing` templates whose footer shows unsubscribe/preferences links require `unsubscribeUrl` /
  `preferencesUrl` in `variables`; a link without URL is dropped.
- A missing locale falls back to the workspace's fallback locale (logged as `DE asked`).
- The template slug is fixed at creation: code depends on it.
- `mailing.send` permission gates every route that reaches recipients; writes publish on realtime topic `mailing:sends`.
- 0.4+ does not read a 0.3 database and moved the webhook path (tenant in the URL).
