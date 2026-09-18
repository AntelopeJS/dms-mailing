# Phase 4 — Integrations: execution report

Branch `mailing-integrations`. All 6 tasks executed in order, TDD where the plan
defined a test. Repo gates green: `pnpm lint`, `pnpm typecheck`, `pnpm knip`,
`pnpm build`, `pnpm test` (50 backend + 37 layer). No commit made.

## What shipped

| Task | Files |
| --- | --- |
| 1 Automation | `src/automation/{index,send-template-action,email-event-trigger}.ts`, `package.json` (`optionalDependencies`), `src/index.ts`, `src/services/events.ts`, `src/test/unit/automation.test.ts` |
| 2 Bounce notification | `src/services/notify.ts`, `src/services/events.ts`, `src/test/unit/notify.test.ts`, both i18n catalogs |
| 3 Quick action / export / cron | `src/quick-actions.ts`, `src/hooks/{index,tenant-export}.ts`, `src/crons/{index,retention}.ts`, `src/index.ts`, `package.json` (`node-cron`), `src/test/unit/{retention,tenant-export}.test.ts`, both i18n catalogs |
| 4 SendBatch | `src/services/send.ts`, `src/test/unit/send-batch.test.ts`, `src/test/integration/sends.test.ts` |
| 5 Realtime (spike) | `src/realtime.ts`, `src/services/{send,events}.ts`, `src/pages/overview.ts`, `src/constants.ts`, `src/test/unit/realtime.test.ts` |
| 6 Wrap-up | `README.md` |

## Deviations from the plan

1. **Trigger handle must be opaque (Task 1).** The plan said `activate` returns
   the subscription object as the handle. It does not survive the AntelopeJS
   module boundary: the object that comes back to `deactivate` is a different
   reference, so `Set.delete(handle)` silently no-ops and the subscription
   leaks. Caught by the plan's own test. `activate` now returns a string id and
   the subscriptions live in a `Map<string, EmailEventSubscription>`. The CMS's
   own triggers (`src/automation/triggers.ts`) return the listener function as
   handle and have the same exposure.
2. **`bounceNotification` returns `NotificationData`, not `SendableNotification`
   (Task 2).** The plan's test reads `notification.linkTo`; `SendableNotification`
   keeps its data private, so the builder output cannot expose it. The pure
   builder returns a typed `BounceNotificationData`; `notifyBounce(tenantId, …)`
   feeds it to `Notification()` and sends with `.toUsers()` to
   `TenantMemberModel.listOwners()`, guarded by try/catch so a notification
   failure never breaks the webhook.
3. **`shouldNotify` covers `failed` too (Task 2).** It reuses `PROBLEM_STATUSES`
   (`bounced`, `spam`, `failed`) — the same set the Sends "problems" tab filters
   on — rather than a second hard-coded list.
4. **Webhook secret excluded from the tenant export (Task 3).** The plan said
   "settings"; the export archive travels further than the admin UI, so
   `ExportedSettings = Omit<MailingSettingsValues, "webhookSecret">`. Settings
   are read straight from the model (not `getSettings`), so an export never
   provisions a settings row for a tenant that has not used mailing.
5. **"Header action" not implemented (Task 3).** The task title names it but no
   step specifies one, and no contract in `00-overview.md` describes it. The
   quick action already surfaces in the ⌘K header palette. Flagging for a
   decision.
6. **Batch path is not reachable over HTTP (Task 4).** `sendTemplate` keeps its
   single-result signature, so the `test-send` route must keep looping one
   recipient at a time to return `{ results: [...] }` — `SendBatch` therefore
   only runs for external `SendTemplate` callers passing an array. The plan's
   integration test ("two recipients → two distinct send ids") passes, but it
   exercises the loop, not the batch. Added `src/test/unit/send-batch.test.ts`
   over an exported pure `matchBatchResponses(recipients, responses, latencyMs)`
   so the index-matching and the missing/rejected-response cases are covered.
   `GetCapabilities()` failures fall back to the loop.
7. **No layer change was needed for the realtime refresh (Task 5).** The plan
   proposed `app/components/SendActions.vue`; per `00-overview.md` §2.6bis that
   component does not exist, and it is unnecessary: `TableView.vue` already
   subscribes to `tableview:row:<controllerLocation>` and calls `refreshAll()`
   on a `created` event, and the TableView registers that topic on its page
   itself (`realtime` defaults to true). `src/realtime.ts` publishes to both
   `tableview:row:/api/mailing/tables/sends` and `mailing:sends`.
8. **Page full id format confirmed:** `modules.mailing.sends` /
   `modules.mailing.overview`, resolved through
   `GetMetadata(Controller, PageMetadata).pageInfo.fullId` and pinned by
   `src/test/unit/realtime.test.ts` rather than hard-coded.

## Task 5 exit criterion

**Sends table: proven working.** With the frontend pointed at this worktree's
backend, a `curl` test send took the table from 5 to 6 rows with no reload.
Raw SSE verification against `/api/realtime/user` also shows, after
`POST /api/realtime/subscribe/modules.mailing.sends`:

```
event: tableview:row:/api/mailing/tables/sends
data: {"type":"created","payload":{"ids":["881fb571-…"]}}
event: mailing:sends
data: {"type":"created","payload":{"ids":["881fb571-…"]}}
```

and, after a `bounced` webhook, the same pair with `type: "updated"`.
Subscribing to `modules.mailing.overview` also receives `mailing:sends`, so the
topic is registered on both pages.

**Volume chart: blocked, topic left in place.** `ChartCardProps` (cms 0.6.6,
`src/interfaces/cms-base/chart-card.ts`) has no `realtimeTopic`, and the chart
nested inside a `ChartCard` gets no `fetchUrl` — `useChartFetch` only subscribes
to realtime topics inside `if (options.fetchUrl)`, so the nested chart's
subscription is never created. `realtimeTopic: MAILING_SENDS_TOPIC` on the
`ChartArea` still registers the page topic (verified over SSE) but nothing on
the client consumes it. Fixing it needs one of: `realtimeTopic` on
`ChartCardProps` in the CMS, or dropping the `ChartCard` wrapper for a bare
`ChartArea` with its own `fetchUrl` (which loses the card's KPI header and
delta, i.e. a phase-2 design regression). Left for the coordinator.

## Manual verification (worktree dev servers)

- Webhook `bounced` → the bell shows "Delivery problem on smoke-order" /
  "The e-mail sent to … could not be delivered." (both i18n keys resolve, params
  interpolated).
- ⌘K → "New template" under a "Mailing" group → opens the Templates creation
  drawer on `/modules/mailing/templates`.
- Retention cron scheduled at 03:15 daily under `runWithLock`; no error at
  startup. It cannot log a first run inside a session, so only `retentionLimit`
  is unit-covered.
- The automation nodes register as no-ops
  (`Optional interface 'interface-cms-automation' has no
  provider`); the builder palette check needs a playground with `cms-automation`
  installed, which this playground does not have.
- `startTenantExportJob` has no caller in cms 0.6.6, so there is no HTTP path to
  trigger a tenant export; the contributor registration is covered by
  `src/test/unit/tenant-export.test.ts`.

## Environment notes (not code)

- `nuxt-layer/node_modules` was missing in this worktree, so `pnpm lint` failed
  on `eslint: command not found` until `cd nuxt-layer && pnpm install`.
- The frontend dev server resolves its backend from a shared
  `~/cloud/antelope/cms-nuxt` workspace and had latched onto **another
  worktree's backend (port 5010)**; realtime verification only became possible
  after restarting it with
  `CMS_FRONTEND_CMD="cd playground && pnpm exec acms dev -b http://127.0.0.1:5011"`.
  The shared `.components_cache` also served a stale copy of this layer's i18n
  catalogs until that restart.
- `docs/` is untracked in this branch — the plan files will be picked up by a
  `git add -A` at commit time.
