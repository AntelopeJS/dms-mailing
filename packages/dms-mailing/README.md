# @antelopejs/dms-mailing

<div align="center">
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="https://antelopejs.com"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

Mailing module for the AntelopeJS DMS: a template library with a block-based
e-mail editor, drafts and published versions, a send log, an overview
dashboard and settings. It owns the data (tenant-scoped Mongo tables), renders
e-mails through the DMS html-render chain and sends them through
`@antelopejs/interface-email`.

The module targets `@antelopejs/dms` 0.7 (0.7.21 or later) and `@antelopejs/dms-frontend` 0.5 (0.5.5 or later).
Like every DMS module, its pages live in the module's own sidebar (Mailing:
Overview, Templates, Sends; Configure: Settings, Suppression list) and are
reserved to the platform owner. The design decisions behind the v2 screens are recorded in
[`docs/design-v2-grill-me.md`](../../docs/design-v2-grill-me.md).

## Breaking changes since 0.3

The v2 redesign neither reads what 0.3.x wrote nor takes its calls:

- **Webhook URL.** `POST /api/mailing/events/<provider>`, with the tenant in
  the body, is gone. Copy the URL **Settings › Provider & webhook** shows
  (`/api/mailing/events/<provider>/<tenantId>`) into the provider again.
- **Settings writes.** `POST /api/mailing/settings` is gone: send the changed
  fields with `PUT /api/mailing/settings`. A write carrying a read-only field
  (`webhookUrl`, `provider`) is refused.
- **Categories.** The settings take `categories` as an array only, no longer
  as its JSON text, and always with the `marketing` category (it can be
  renamed, not removed: campaign rules depend on it).
- **Interface.** The module implements `@antelopejs/interface-dms-mailing`
  0.6, whose `SendStatus` adds `suppressed`.
- **Data.** A 0.3.x database is not read any more (settings rows without the
  tenant key, templates without version numbers, sends without a stage):
  start the module on an empty database.

## Drafts and versions

The editor never changes what customers receive. It saves a draft next to the
published content; **Publish** turns the draft into the next version, keeps
it in `mailing_template_versions` and makes it what `SendTemplate` sends.
**Discard** drops the draft. Test sends use the draft (their subject starts
with `[TEST]`), real sends always use the published version, and every send
records the version it used and the locale the caller asked for, so the log
can render exactly what went out and show `DE → EN` fallbacks.

## Layout

| Path | What it holds |
| --- | --- |
| `src/index.ts` | Module lifecycle (`construct`/`start`/`stop`/`destroy`); registers the Vue frontend module, the automation nodes, the tenant-export contributor, the realtime topics and the crons. |
| `src/pages/` | The DMS pages: `overview`, `templates`, the editor (`templates/:id`), `sends`, `settings` and `suppressions`, all inside the module sidebar. Every custom block carries a `.meta()` with i18n keys. |
| `src/data/` | The `TableView` data controllers behind `/api/mailing/tables/*`. |
| `src/routes/` | The HTTP API under `/api/mailing` (templates, sends, events, metrics, settings, provider, suppressions). |
| `src/engine/` | The pure-TS rendering engine: block tree + variables → resolved e-mail. |
| `../interface-dms-mailing/` | The separately published public AntelopeJS interface (see below). |
| `src/automation/` | The `dms-automation` action and trigger. |
| `src/crons/` | The daily, replay-safe send-log retention job and the hourly refresh of the templates needing attention. |
| `src/hooks/` | The tenant data export contributor. |
| `frontend-vue/` | Vue module registered under the `Mailing` component prefix: gallery display, template and send drawers, test / real send dialogs, the three-pane block editor, the overview and settings blocks, `dms.email.ts` server template entry and the `mailing-*.json` i18n catalogs. Its own composables and utils are imported by path, not auto-imported. |
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

A recipient on the [suppression list](#suppression-list) gets nothing: its
row in the log and its entry in `results` have the status `suppressed`, and
`error` names the reason as an i18n key
(`$dms_mailing.errors.suppressed.hard_bounce`, `….complaint`,
`….unsubscribe`, `….manual`). Do not retry such a send.

## What a recipient receives

Every e-mail goes out as HTML and as a plain-text part generated from the
same blocks (`multipart/alternative`), with a `viewport` meta. The header logo
is the DMS branding's light logo (`branding.logo.default.light`) at an
absolute public URL (the DMS `clientBaseUrl`): on a `localhost`, private-IP or
`.local` address, or for an SVG (refused by Gmail and Outlook), it is left out
rather than shown broken. The editor canvas draws the same header and footer.

**Footer links are system variables.** A footer whose unsubscribe or
preferences label is filled (or a `{{unsubscribeUrl}}` / `{{preferencesUrl}}`
token anywhere) declares `unsubscribeUrl` / `preferencesUrl` as variables of
type `url`, required when the template is in the `marketing` category. The
editor shows them in the Variables tab, the template drawer in its contract and
its "Call it from code" snippet; pass them in `variables` at send time:

```ts
await SendTemplate("newsletter-october", {
  tenantId,
  to: "ana@example.com",
  variables: {
    unsubscribeUrl: `https://app.example.com/unsubscribe/${token}`,
    preferencesUrl: "https://app.example.com/preferences",
  },
});
```

A link whose URL is missing is dropped from the e-mail, and an empty label
removes the link. For a marketing template, a missing required URL refuses a
manual real send, and every send when "Missing variables" is set to refuse;
a test send never waits for it. The starters and the templates of the other
categories get a footer with a legal line and no unsubscribe link.

## Suppression list

An address goes on the workspace's suppression list (`mailing_suppressions`)
when the provider reports a permanent bounce (a `bounced` event that is not
temporary: no `4xx` / `4.x.x` answer, no `soft` bounce type), a spam
complaint (`spam`) or an unsubscription (`unsubscribed`), or when someone adds
it by hand. A test send only adds its address on a permanent bounce: a spam
report or an unsubscription on a test is the editor's own gesture.

Every send path checks the list: `SendTemplate`, the automation action, the
real send dialog, "Send again" and "Send to another address". A suppressed
recipient is logged with the status `suppressed` (the Sends page has a tab for
them, and the figures leave them out) and nothing is handed to the provider.
A test send to the editor's own address still goes out, and the dialog warns
that the address is suppressed; a test to any other suppressed address does
not.

**Configure › Suppression list** lists the addresses with their reason and
the send that caused it, searchable and filtered by reason. **Add an
address** puts one on the list by hand (with an optional note); **Reactivate**
lifts it, and the next send reaches it again. The same operations are
`POST /api/mailing/suppressions` (`{ "email", "note"? }`, `409` when the
address is already on the list) and `DELETE /api/mailing/suppressions/:id`.
The tenant data export carries the list as `suppressions.json`.

## Configuration

The module takes one option, in the `config` of its entry in the project's
`antelope.config.ts`:

```ts
config: {
  // false renders with the module's own fallback HTML, not the DMS chain.
  useHtmlRender: true,
},
```

The webhook URL of **Settings › Provider & webhook** starts with the DMS
`clientBaseUrl`, the dashboard's public origin (read through
`GetClientBaseUrl`): set it in the `dms` module's config as soon as a real
provider has to reach the webhook. The module declares the route a public
endpoint of the dashboard, so the frontend server's proxy lets a provider's
`POST` through without an `Origin`, never sends it a session and relays the
`x-mailing-webhook-secret` header. The URL never follows the headers of the
request that reads it. A provider already posting to the API origin
(`apiBaseUrl`) keeps working: the path and the header are the same.

## Webhook contract

The module has one generic event format. Provider events are posted to

```
POST <clientBaseUrl>/api/mailing/events/<provider>/<tenantId>
```

the URL **Settings › Provider & webhook** shows, ready to copy. `<provider>`
is a free label recorded with the event (the settings use the configured
e-mail provider's name); `<tenantId>` names the workspace.

Every request carries the workspace's secret in the `x-mailing-webhook-secret`
header (Settings › Provider & webhook; rotating it invalidates the old one at
once). The body is JSON:

```sh
curl -X POST https://dms.example.com/api/mailing/events/postmark/<tenantId> \
  -H "Content-Type: application/json" \
  -H "x-mailing-webhook-secret: <secret>" \
  -d '{"messageId":"<provider message id>","type":"bounced","at":"2026-09-09T10:00:00.000Z","details":{"reason":"550 5.1.1 No such user","bounceType":"hard","eventId":"<provider event id>"}}'
```

| Field | Meaning |
| --- | --- |
| `messageId` | The id the provider returned when the e-mail was sent (the send's `providerMessageId`). Required. |
| `type` | `queued`, `sent`, `delivered`, `opened`, `clicked`, `bounced`, `spam`, `failed` or `unsubscribed`. Required. |
| `at` | When it happened (ISO date); now by default. |
| `details.reason` | The provider's words (`550 5.1.1 …`), shown in the log. |
| `details.bounceType` | `soft`/`transient`/`temporary` or `hard`/`permanent`; without it the SMTP class of `reason` decides. A permanent bounce suppresses the address. |
| `details.eventId` | The provider's event id: a retried webhook with the same id is ignored. |
| `details.url`, `details.userAgent` | Shown on the click and open steps. |

The answer is `200 {"recorded": true}`, or `{"recorded": false}` when no send
carries the message id (or the event was already recorded). The event is
appended to the send's timeline, the status only ever moves forward (a
delivery after a provider failure wins over it), a hard bounce, a spam report
or an unsubscription puts the address on the suppression list, and repeated
problems on a template notify the tenant owners in the DMS bell.

A refused call gets a readable JSON body, for the relay's logs:

| Status | `reason` | Why |
| --- | --- | --- |
| `403` | `missing_secret` | No `x-mailing-webhook-secret` header. |
| `403` | `bad_secret` | The header does not match the workspace's secret, or the workspace has no mailing settings yet (any mailing page or send creates them). |
| `400` | `invalid_event` | The secret is right but the body is not an event. |

```json
{ "error": "webhook_refused", "reason": "bad_secret", "message": "The x-mailing-webhook-secret header does not match …" }
```

The secret is checked before the body, so a caller without it learns nothing
of the format. **Settings › Provider & webhook › Webhook status** shows the
last event received (when, its type, the provider label, whether it matched a
send) and the last call refused (when, and why). **Send a test event** posts a
test event to the URL shown, with the stored secret, from the backend: it
proves the URL is reachable from the server, the secret and the format, and
touches no send (its message id is `dms-mailing-webhook-test`).

### Relaying a provider

Providers post their own format (Postmark, SES through SNS, Mailgun,
SendGrid, Resend…) and most cannot add a custom header. Put a small relay
between them and the module: it checks the provider's own signature,
translates each event and forwards it with the secret. A sketch for Postmark:

```ts
const TYPES: Record<string, string> = {
  Delivery: "delivered",
  Open: "opened",
  Click: "clicked",
  Bounce: "bounced",
  SpamComplaint: "spam",
  SubscriptionChange: "unsubscribed",
};

export async function relayPostmark(event: PostmarkEvent): Promise<void> {
  const type = TYPES[event.RecordType];
  if (!type) return;
  await fetch(MAILING_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mailing-webhook-secret": MAILING_WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      messageId: event.MessageID,
      type,
      at: event.ReceivedAt ?? event.DeliveredAt ?? event.BouncedAt,
      details: {
        reason: event.Details ?? event.Description,
        bounceType: event.Type === "SoftBounce" ? "soft" : "hard",
        eventId: String(event.ID ?? ""),
        url: event.OriginalLink,
        userAgent: event.UserAgent,
      },
    }),
  });
}
```

A module of the same project can skip HTTP altogether and call
`RecordEmailEvent(tenantId, event)` from the public interface. A provider or
a relay posts through the dashboard's URL, as a public endpoint the module
declares (`AddFrontendModule({ publicEndpoints })`), or straight to the API on
`apiBaseUrl` when it is reachable: the path and the header are the same.

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
`mongodb://localhost:27017` (database `playground_dms_mailing`); set
`MONGO_URL` to point the playground at another instance. E-mails go to an
Ethereal account, or to a local SMTP server when `SMTP_PORT` is set.

Both packages are public on npm, published under the `@antelopejs` scope with
npm trusted publishing and provenance. The interface package must be released
before `@antelopejs/dms-mailing`. Each package has its own manual workflow:
`Release DMS mailing interface` publishes `../interface-dms-mailing`, `Release
DMS mailing module` publishes this package and refuses to run until the
interface version its dependency range is floored at resolves on npm. Inside
the workspace that same range resolves to the sibling package, through
`link-workspace-packages`. The module implements the interface, so that range
is capped below the next minor (`>=0.6.0 <0.7.0`): a breaking interface minor
never reaches a module that does not implement it, and the release workflow
refuses any other shape.

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
