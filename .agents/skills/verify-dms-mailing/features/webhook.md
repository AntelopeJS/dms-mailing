---
covers:
  - packages/dms-mailing/src/routes/events.ts
  - packages/dms-mailing/src/services/events.ts
  - packages/dms-mailing/src/services/webhook-status.ts
  - packages/dms-mailing/src/services/notify.ts
  - packages/dms-mailing/src/automation/email-event-trigger.ts
  - packages/dms-mailing/src/validation/send-event-type.schema.ts
docs:
  - packages/dms-mailing/docs/5.extending.md
  - packages/dms-mailing/docs/6.faq.md
---

# Webhook

The generic provider webhook (`POST /api/mailing/events/<provider>/<tenantId>`), `RecordEmailEvent`, the send status ordering, the retry rules, the refusal reasons, the bell notification threshold and posting through the dashboard URL.

## Sub-features

- `a-refused-webhook-call-gets-its-status-and-reason-and-shows-in-the-status`: 403 missing_secret, 403 bad_secret (wrong, shorter, longer), 400 invalid_event for seven bad bodies, secret before body, status recording, an unknown workspace.
- `the-webhook-is-reachable-through-the-dashboard-url-with-the-header-passed-on`: the public endpoint on the dashboard origin.
- `a-send-status-only-moves-forward-and-counts-opens-and-clicks`: the 17-step forward sequence and the nine failed-then-event cases.
- `a-retried-webhook-event-is-recorded-once`: event id and type, time and details deduplication, default time, details kept.
- `record-email-event-does-what-the-webhook-does`: the interface function.
- `owners-get-one-bell-notification-per-template-and-hour-at-three-problems-and-five-percent`: 3 problems and 5%, the one hour window, tests, event types, one per template and hour, owners only.

## How to get to it (user POV)

- A provider or relay posting to the URL Settings › Provider & webhook shows; the bell and Mailing › Sends.

## Driving it with dms-control

```bash
dms-control journey "$RUN" webhook
```

Sends are created with `ImportSends` (their own message ids and dates), events are posted with the real secret through `raw`.

## Gotchas

- The notification journey reads the owner's bell at `/dms/pages/settings/user/notifications/inbox` and waits 2.5 s before each read.
- The relay sketch of the docs is the customer's code and is not driven.
