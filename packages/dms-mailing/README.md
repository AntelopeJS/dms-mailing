# @antelopejs/dms-mailing

<div align="center">
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="https://antelopejs.com"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

Mailing module for the AntelopeJS DMS: a template library with a block-based
e-mail editor, a send log, an overview dashboard and
settings. It owns the data (tenant-scoped Mongo tables), renders e-mails
through the DMS html-render chain and sends them through
`@antelopejs/interface-email`.

## Layout

| Path | What it holds |
| --- | --- |
| `src/index.ts` | Module lifecycle (`construct`/`start`/`stop`/`destroy`); registers the Vue frontend module, the automation nodes, the tenant-export contributor, the realtime topics and the retention cron. |
| `src/pages/` | The DMS pages: `overview`, `templates`, `editor`, `sends` and the settings form. |
| `src/data/` | The `TableView` data controllers behind `/api/mailing/tables/*`. |
| `src/routes/` | The HTTP API under `/api/mailing` (templates, sends, events, metrics, settings, provider). |
| `src/engine/` | The pure-TS rendering engine: block tree + variables → resolved e-mail. |
| `../interface-dms-mailing/` | The separately published public AntelopeJS interface (see below). |
| `src/automation/` | The `dms-automation` action and trigger. |
| `src/crons/` | The daily, replay-safe send-log retention job. |
| `src/hooks/` | The tenant data export contributor. |
| `frontend-vue/` | Vue Inertia module: gallery display, detail drawers, block editor, `dms.email.ts` server template entry and the `mailing-*.json` i18n catalogs. |
| `playground/` | Standalone AntelopeJS project wiring this module to the DMS, Mongo, the API server and the mailer, for local development. |

## Public interface

Published as `@antelopejs/interface-dms-mailing`.

```ts
import {
  RecordEmailEvent,
  SendTemplate,
} from "@antelopejs/interface-dms-mailing";

// Render a live template and send it.
const result = await SendTemplate("order-confirmation", {
  tenantId,
  to: [{ email: "sofie@example.com", name: "Sofie" }],
  locale: "fr",
  variables: { order: { total: "48.00" } },
  source: "checkout",
});

// Report a provider event against the send it belongs to.
await RecordEmailEvent(tenantId, {
  provider: "brevo",
  messageId,
  type: "bounced",
  details: { reason: "mailbox full" },
});
```

`SendTemplate` accepts one address or an array. With more than one recipient
and a provider that advertises `features.batch`, the module renders the e-mail
once and issues a single `SendBatch`; otherwise it loops `Send`. Either way one
row per recipient lands in the send log, and the returned
`SendTemplateResult` describes the first one.

## Webhook contract

Provider events are posted to `POST /api/mailing/events/:provider`, guarded by
the `x-mailing-webhook-secret` header (the secret lives in the mailing
settings, per tenant).

```sh
curl -X POST http://localhost:5010/api/mailing/events/brevo \
  -H "Content-Type: application/json" \
  -H "x-mailing-webhook-secret: <settings.webhookSecret>" \
  -d '{"messageId":"<provider message id>","type":"bounced","at":"2026-09-09T10:00:00.000Z","details":{"reason":"mailbox full"}}'
```

`type` is one of `queued`, `sent`, `delivered`, `opened`, `clicked`,
`bounced`, `spam`, `failed`, `unsubscribed`. The event is appended to the
send's timeline, the send status only ever moves forward, and a `bounced`,
`spam` or `failed` event notifies the tenant owners in the DMS bell.

## Retention

The daily sweep retires sends only when their creation time, latest event time
and latest ingested activity all precede the tenant's retention cutoff. Queued
sends remain active. Retirement irreversibly closes a send to provider events;
the sweep then removes its events and finally the send. A failed cleanup leaves
the retirement marker available for another sweep to resume.

Concurrent sweeps require no shared cron lock. Send mutations use the database
interface's `Table.atomicMutation` revision contract. Retirement rechecks the
send's age and activity before comparing its revision; concurrent webhook
activity advances that revision and invalidates the stale candidate. Known
webhook conflicts reread and recompute counters, with a bounded retry limit.
An unknown write outcome fails without retrying or reporting a deletion.

This requires the atomic-mutation interface and adapter implementations; generic
filtered updates and deletes are not an alternative. The dependency releases
are prerequisites for rollout. Every send is inserted with a unique identity and
revision, stored in the declared `revision` column.

Each sweep inspects at most 20,000 send candidates per tenant and reports only
actual send deletions. It also reconciles orphan events left by writers that
crashed after inserting an event for an already-deleted send. That reconciliation
scans the event table in keyset pages of 500 rows, with a parent lookup per
distinct send in each page; its total work is not capped by the send limit.
Event writes create the parent first and never reuse deleted send IDs. Neither
retention path deletes templates or files. Disabled retention skips both passes.

## Automation nodes

Registered against the optional `@antelopejs/interface-dms-automation`.
They are inert no-ops when no module implements it.

| Node | Id | Purpose |
| --- | --- | --- |
| Action | `mailing.send-template` | Renders a live template and sends it. Inputs `tenantId`, `slug`, `to` (required), `locale`, `variables`, `source`. |
| Trigger | `mailing.email-event` | Fires on provider events. Config `types` filters the event types; empty fires on every one. |

## Development

```sh
pnpm install
pnpm --dir frontend-vue install
pnpm --dir playground install

pnpm dev            # backend + module, watching src/
pnpm frontend:dev   # the DMS front-end, in another terminal
```

The backend listens on `http://localhost:5010` and needs a MongoDB on
`mongodb://localhost:27017` (database `playground_dms_mailing`).

Both packages are public on npm, published under the `@antelopejs` scope with
npm trusted publishing and provenance. The interface package must be released
before `@antelopejs/dms-mailing`. Each package has its own manual workflow:
`Release DMS mailing interface` publishes `../interface-dms-mailing`, `Release
DMS mailing module` publishes this package and refuses to run until the
interface version its dependency range is floored at resolves on npm. Inside
the workspace that same range resolves to the sibling package, through
`link-workspace-packages`.

## Conventions

Every backend-declared text uses the `$key` convention: a string starting with
`$` is resolved against the i18n catalogs by the front-end. Add keys to
`frontend-vue/i18n/locales/mailing-en-GB.json` and its French counterpart.

## Checks

```sh
pnpm lint        # oxlint + oxfmt + the layer's eslint
pnpm typecheck   # tsc --noEmit on tsconfig.json
pnpm knip        # unused dependencies
pnpm build       # tsconfig.json -> dist/
pnpm test        # backend (mocha through `ajs module test`) + layer (vitest)
```
