---
covers:
  - packages/dms-mailing/src/db/models/sends.model.ts
  - packages/dms-mailing/src/db/models/send-events.model.ts
  - packages/dms-mailing/src/db/tables/sends.table.ts
  - packages/dms-mailing/src/db/tables/send-events.table.ts
  - packages/dms-mailing/src/types/sends.ts
  - packages/dms-mailing/src/routes/provider.ts
  - packages/dms-mailing/src/services/provider.ts
  - packages/dms-mailing/frontend-vue/app/components/ProviderPill.vue
  - packages/dms-mailing/frontend-vue/app/components/RealSendModal.vue
  - packages/dms-mailing/frontend-vue/app/components/RecipientsField.vue
  - packages/dms-mailing/frontend-vue/app/components/TestSendModal.vue
  - packages/dms-mailing/frontend-vue/app/composables/useReplayToast.ts
  - packages/dms-mailing/frontend-vue/app/utils/send-link.ts
  - packages/dms-mailing/frontend-vue/app/utils/send-stats.ts
  - packages/dms-mailing/frontend-vue/app/utils/send-values.ts
  - packages/dms-mailing/frontend-vue/app/utils/timeline.ts
  - packages/dms-mailing/frontend-vue/app/utils/recipients.ts
  - packages/dms-mailing/frontend-vue/app/utils/rendering-title.ts
  - packages/dms-mailing/src/routes/sends.ts
  - packages/dms-mailing/src/pages/sends.ts
  - packages/dms-mailing/src/data/sends-table.ts
  - packages/dms-mailing/src/data/locale-fallback.ts
  - packages/dms-mailing/src/services/send-stats.ts
  - packages/dms-mailing/src/services/send-stat-items.ts
  - packages/dms-mailing/src/services/provider-banner.ts
  - packages/dms-mailing/src/realtime.ts
  - packages/dms-mailing/src/permissions.ts
  - packages/dms-mailing/src/services/permissions.ts
  - packages/dms-mailing/frontend-vue/app/components/SendDrawer.vue
  - packages/dms-mailing/frontend-vue/app/components/FixAddressModal.vue
  - packages/dms-mailing/frontend-vue/app/components/RenderingModal.vue
  - packages/dms-mailing/frontend-vue/app/utils/send-actions.ts
  - packages/dms-mailing/frontend-vue/app/utils/problems.ts
docs:
  - packages/dms-mailing/docs/4.usage/4.sends.md
  - packages/dms-mailing/docs/5.extending.md
---

# Sends

The send log: stat strip, stage tabs, the send drawer, send again, send to another address, the provider banner with Send the failures again, the sidebar badge, and the test and real send routes.

## Sub-features

- Stat strip (Sends, Delivered, Problems, Queued, Median latency) with comparison.
- Stage tabs, the Locale column with `DE asked`.
- Drawer: position, J/K, URL, resize, plain-language problem, timeline, origin, data, footer by status.
- Send again, send to another address, replay rules (spam, permanent bounce, suppressed address).
- Provider banner thresholds and Send the failures again (100 cap).
- Sidebar badge (real problems of 24 h), test send and real send routes.
- `stat-strip-states-the-period-figures-and-their-changes`: the stat strip counts real sends, delivered, problems, the queue and the median latency, compares all but the queue, and leaves test sends out.
- `stage-tabs-hold-their-sends`: each stage tab lists exactly its sends, with its count; Problems leaves test sends out.
- `locale-column-says-when-the-locale-asked-was-not-sent`: the Locale column shows the locale sent, and when it differs from the locale asked for, says DE asked.
- `drawer-opens-steps-keeps-its-url-and-closes`: a click opens the send in a drawer headed by recipient and template and its place in the log; J and K step; the URL keeps the send; Escape or a click beside closes it.
- `drawer-width-is-dragged-and-remembered`: dragging the drawer's left edge widens it, a wide drawer puts the timeline and the origin side by side, and the drawer opens again at the width given.
- `drawer-footer-follows-the-status`: the drawer footer offers the actions of the send's status, a suppressed send whose address was reactivated offers Send again…, a send sent again offers none.
- `send-again-rules-by-status`: a spam report is never answered, a permanent bounce needs another address, a temporary bounce or a failure goes again, the original is resolved and linked.
- `send-again-to-a-suppressed-address-sends-nothing`: sending again to an address that is on the suppression list sends nothing, warns, and leaves the original a problem.
- `banner-appears-from-3-provider-failures-and-ignores-what-is-not-the-providers`: 3 provider failures of the last hour raise the banner; 2, old failures, bounces, spam reports and failed tests do not.
- `banner-rate-boundary-is-10-percent-of-the-hours-real-sends`: 3 failures of 30 real sends (10%) raise the banner, 3 of 31 (9.7%) do not.
- `banner-a-connection-failure-raises-it-alone`: a single failure of the connection to the provider raises the banner even among many deliveries.
- `send-the-failures-again-sends-up-to-100-and-leaves-out-the-rest`: Send the failures again sends the hour's provider failures with the same data, leaves out suppressed addresses, bounces, spam, tests and old failures, and never twice.
- `send-the-failures-again-is-capped-at-100`: with 101 failures, Send the failures again sends 100 and the confirmation says so; with every failure suppressed only the settings action remains.
- `banner-offers-no-replay-when-every-failure-is-suppressed`: when every failure of the hour is to a suppressed address the banner only links to the provider settings.
- `drawer-explains-the-problem-timeline-origin-and-data`: the drawer says in plain words what went wrong, lists the timeline with the provider's answer, the origin, and the data sent.
- `send-again-from-the-drawer-is-confirmed-and-resolves-the-problem`: Send again… asks for confirmation with the recipient, the version and the last error, sends, and the original is marked Resolved with no second send again.
- `send-to-another-address-checks-the-corrected-address`: Send to another address refuses an empty, invalid or identical address with its message, then sends to the corrected one.
- `test-send-and-real-send-rules`: a test send is tagged [TEST] and left out of the figures; a real send needs a live template and counts; both take 1 to 5 valid addresses.
- `sends-badge-counts-real-problems-of-the-last-24-hours`: the Sends badge in the sidebar counts the real sends with a problem in the last 24 hours.

## How to get to it (user POV)

- Modules › Mailing › Sends (`/modules/mailing/sends`); click a row for the drawer (`?record=<id>`).

## Driving it with dms-control

```bash
dms-control journey "$RUN" sends [journey-id ...] --skill "$SKILL"
```

- `journeys/parts/sends-kit.mjs` seeds a log of every status through `ImportSends` (`seedLog`), plus a suppressed send, and reads the dialog and the tabs.
- Browser reads go through `journeys/parts/browser-kit.mjs`, so the skill lints clean without playwright types.

## Gotchas

- The log lists every kept send whatever the period; the period only drives the strip. Tab counts include the previous-period sends.
- Imported failures need `sentAt` inside the last hour for the banner; spread them with fractions of a minute.
- The corrected-address field starts with the bounced address; its errors show on blur.
- Members cannot be granted the module-scoped page permissions by the fixture (`modules.mailing.main.sends`), so the `mailing.send` gate is Not driven.
