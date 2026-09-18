# Phase 5 — Review fixes report

Branch `mailing-review-fixes`, base `25b14d7`. Mode TDD: every finding got its failing test first.
No commits — the coordinator commits.

**Gates (real exit codes, no pipe masking):**

| Gate | Exit |
|---|---|
| `pnpm lint` | 0 |
| `pnpm typecheck` | 0 |
| `pnpm knip` | 0 |
| `pnpm build` | 0 |
| `pnpm test` | 0 — backend 72 passing (was 50), layer 38 passing |

Verdict on the review itself: **all nine findings reproduced in the code**. None was disproved.
Two of the prescribed fixes had to be adjusted after reading the CMS / provider `.d.ts` — see
findings 5 and 6. Three extra changes were needed to make the fixes whole; they are listed at the
end so the coordinator can see exactly what exceeds the letter of the plan.

---

## 1. Automation fan-out isolation — **fixed**

`src/automation/email-event-trigger.ts`

Confirmed: `emitEmailEvent` called `subscription.emit(payload)` bare, and `recordEmailEvent`
(`src/services/events.ts`) calls it *after* the send row is updated and the `SendEvent` inserted but
*before* `publishSendUpdated` and `notifyBounce`. A throwing subscription therefore produced a 500 on
the public webhook route with the row already mutated — the provider retries, the counters double.

Fix: each `emit` runs in its own `try/catch`, logging with `Logging.Warn` (the CMS's own pattern in
`cms/src/realtime/*.ts`). The loop now iterates `subscriptions` entries so the handle can be named in
the warning.

Tests: `src/test/unit/automation.test.ts` — "keeps fanning out when a subscription throws" (a
throwing subscription registered before a working one; the working one still receives the payload and
`emitEmailEvent` does not throw). Integration: `src/test/integration/events.test.ts` — "records the
event even when an automation subscription throws" posts a real webhook while a throwing subscription
is active and asserts `200` + `recorded: true` + the send reaching `delivered`.

Red check performed: without the `try/catch` the unit test fails with
`expected [Function] to not throw an error but 'Error: subscriber exploded' was thrown`.

## 2. Every recipient's result is returned — **fixed**

`src/services/send.ts`, `src/interfaces/cms-mailing/index.ts`, `src/routes/sends.ts`,
`src/automation/send-template-action.ts`

Confirmed: `return results[0] as SendTemplateResult` discarded recipients 2..N.

Public interface (additive only): `SendTemplateResult` gains `results?: SendTemplateResult[]`, with
TSDoc on both the interface and the field. The existing fields are untouched, so single-recipient
callers see exactly what they saw before. `aggregateResults` keeps `sendId` / `messageId` from the
first recipient, degrades `status` through a named `OUTCOME_SEVERITY` lookup map (no `if` chain), and
carries the first `error`.

`results` is populated on every call, including single-recipient ones (an array of one). That is
additive — nothing that read `sendId`/`status`/`messageId`/`error` changes — and it lets callers use
one code path.

`sendTemplateAction` now logs once with the list of failed recipients instead of only the first
error, and its `outputSchema` describes `results`. The `test-send` route **stopped looping**: it
passes the whole `to` array to a single `sendTemplate` call and returns `result.results ?? [result]`,
so the response shape (`{ results: SendResult[] }`, consumed by
`nuxt-layer/app/components/TestSendModal.vue`) is unchanged. Side effect of dropping the loop: the
template is prepared and rendered once instead of N times, and a batch-capable provider now takes the
batch path for a multi-recipient test send (the `nodemailer` test provider advertises no batch
support, so the suite still exercises `deliverEach`).

Tests: `src/test/unit/send.test.ts` — the aggregation suite covers the single-recipient shape, the
degrade-to-`failed` case with the error surfaced, and the "least advanced status wins when nothing
failed" case. The composition inside `sendTemplate` is a single line over `recordAll` +
`aggregateResults`, both of which are directly tested; the existing integration test "records one send
per recipient of a multi-recipient test send" still passes through the new single-call route.

## 3. Per-recipient isolation — **fixed**

`src/services/send.ts`

Confirmed at both sites. `deliverEach` awaited `Send()` with no guard, so a transport rejection (not
a `success: false` response) aborted the loop and left already-accepted messages unrecorded —
invisible in the log and metrics, and their later webhooks undeliverable because `recordEmailEvent`
resolves by `providerMessageId`. `recordAll` had the same shape.

Fix: `deliverOne` turns a throw into a `failed` `DeliveredMessage` carrying the exception message;
`recordOne` turns a failing insert into a `failed` `SendTemplateResult` that keeps the
`providerMessageId` (so the row is still correlatable) and uses a named `UNRECORDED_SEND_ID = ""` for
the id that was never assigned. Both are injected through `EmailSender` / `SendRecorder` function
types defaulting to the real `Send` / `record`, which is what makes them testable without a provider
or a database.

Tests: `src/test/unit/send.test.ts` — "keeps the messages the provider accepted when a later send
throws" (recipient 1 accepted with its `messageId`, recipient 2 `failed` with the transport message)
and "keeps the sends it could record when a later insert throws".

## 4. Idempotent bounce notifications — **fixed**

`src/services/notify.ts`, `src/services/events.ts`

Confirmed. `SendableNotification.toUsersIdempotently(userIds, idempotencyKey, options?)` exists
(`cms-notifications/sendable.d.ts:9` — the finding said line 7) and was unused.

Fix: `BounceNotificationInput` gains `sendId`, threaded from `recordEmailEvent` (which has
`send._id`). `bounceIdempotencyKey` builds `` `${sendId}:${type}` `` through a named separator
constant, and `deliverBounceNotification` sends through `toUsersIdempotently`.

**Caveat worth knowing.** Reading `cms/src/interfaces/cms-notifications/sendable.ts`:
`toUsersIdempotently` delegates to `toUsers({ idempotencyKey })`, which calls the private
`requireIdempotencySupport` — and that **throws** `"CMS idempotent notification delivery is
unavailable"` when `internal.SupportsIdempotency()` is not `true`. The cms 0.6.6 implementation
returns `true` unconditionally, so this is safe against the declared `^0.6.6` dependency. But against
an older implementation of the same interface the throw would be swallowed by the existing
`try/catch` in `notifyBounce` and bounces would stop notifying entirely. I did **not** add a
fallback to `toUsers`: falling back silently would restore exactly the duplicate notifications this
finding exists to remove. Flagging it rather than hiding it.

Tests: `src/test/unit/notify.test.ts` — "keys a bounce on the send it belongs to and its event type"
and "delivers through the idempotent path with a stable key" (two calls, same key, asserted through a
recording `IdempotentNotificationTarget` that `SendableNotification` structurally satisfies).

## 5. Bounded retention pass — **fixed, and the lock IS refreshable**

`src/crons/retention.ts`, `src/db/models/sends.model.ts`

Confirmed: `listOlderThan` materialised every stale send and `purgeSend` issued one `getBySend` + N
deletes per row, with no bound against `RETENTION_LOCK_TTL_MS` (30 min).

The plan asked me to read `JobLockModel`'s `.d.ts` first and state which branch I took. **It does
expose a refresh**: `refresh(lockKey, ttlMs, holder): Promise<boolean>`
(`cms/dist/interfaces/job-locks/db/models/jobLocks.model.d.ts`), and `WORKER_ID` — the same holder
`runWithLock` acquires with — is exported from `job-locks`. So I did **both**:

- paged the purge with `RETENTION_LIMITS.pageSize = 500`,
- refreshed the lock between pages via `GetModel(JobLockModel).refresh(RETENTION_LOCK_KEY, …, WORKER_ID)`
  (the lock key is now one constant shared with `scheduleRetention`),
- **and** capped the run at `RETENTION_LIMITS.maxRows = 20 000` rows per tenant. The cap is belt and
  braces: it matches the CMS's own precedent (`cms/src/crons/cleanup-user-invites.ts` caps a sweep at
  `EXTENSION_CLEANUP_BATCH = 500` and lets the rest drain over following nights), and it bounds a
  first run over a pathological backlog even if the refresh were to fail.

Paging detail: each page re-reads from offset 0 (`slice(0, pageSize)`), because the previous page has
just been deleted — there is no offset drift to get wrong.

`SendModel.listOlderThan(limit, pageSize)` now takes a required page size. Retention is its only
caller.

The purge loop is a generic `purgeInPages(pass, limits)` over a `RetentionPass` interface
(`loadPage` / `purgeSend` / `beforeNextPage`), so it is testable without a database.

Tests: `src/test/unit/retention.test.ts` — "purges a backlog page by page and refreshes the lock
between pages" (`2 × pageSize + 1` rows → exactly 3 pages, 2 refreshes, all rows purged) and "stops at
the bounded number of rows per run" (small limits, 100-row backlog → 5 rows over pages `[2, 2, 1]`).

## 6. Per-message latency in batch sends — **fixed, no real per-response value exists**

`src/services/send.ts`

Confirmed: `deliverBatch` handed one whole-batch wall-clock to `matchBatchResponses`, which stamped it
on all N rows, and `src/services/metrics.ts` medians `latencyMs` — so a batch of N inflated the
latency KPI roughly N×.

The plan asked me to prefer a real per-response latency if `BatchEmailMessageResponse` carries one.
**It does not.** `@antelopejs/interface-email`'s `BatchEmailMessageResponse extends EmailResponse`
adds only `batchId`, `index` and `recipient`; `EmailResponse` carries `timestamp?: Date` (when the
message was accepted) but no duration and no per-message start. A single accept timestamp cannot be
turned into a latency without a per-message start the provider never reports.

So the fallback applies: `matchBatchResponses` divides the batch wall-clock by the recipient count
(`Math.round`, guarded by a named `SINGLE_MESSAGE` floor against a zero-length batch). **This is an
approximation** — it assumes the provider spent its time evenly across the batch, which is what a
batch API's amortised cost per message actually means for a latency KPI, but it is not a measurement
of any individual message. Per the plan, that caveat is documented here and not as a code comment.

Tests: `src/test/unit/send-batch.test.ts` — "splits the batch wall-clock over the messages it covered"
(4 recipients, 12 ms batch → 3 ms each); the pre-existing 2-recipient assertion was updated from the
batch total to the per-message value, which is the behaviour change itself.

## 7. Cron tasks are destroyed on stop — **fixed**

`src/crons/retention.ts`, `src/index.ts`

Confirmed on the installed node-cron 4.6.0. `destroy(): void | Promise<void>` exists on
`ScheduledTask` (`node-cron/dist/node-cron.d.cts:62`), and `TaskRegistry` in
`node-cron/dist/node-cron.cjs` only drops a task from its module-level `tasks` map on the
`task:destroyed` event — `stop()` alone leaves it there, so every `ajs project run -w`
construct/destroy cycle leaked one task. `InlineScheduledTask.destroy()` calls `stop()` itself, so the
order is not load-bearing; I kept both calls explicit.

`stopRetention(task)` stops then destroys and is awaited by the module's `stop()`, which is now
`async` (the CMS's own `src/index.ts` exports an async `stop()`, so this is the idiomatic shape) —
previously the teardown was fire-and-forget and could not be awaited or tested. The reference is
dropped before the teardown, as the plan asked.

Test: `src/test/unit/retention.test.ts` — "drops the task from the node-cron registry when it is
stopped", asserting on `cron.getTasks().has(task.id)`.

Red check performed: with `destroy()` removed the test fails with `expected true to equal false`.

**Upstream note, out of scope:** `cms`'s own `stop()`
(`cms/src/index.ts:201-207`) has exactly the same leak — `for (const task of cronTasks) task.stop()`
with no `destroy()`. Worth reporting to the CMS.

## 8. Subscriptions cleared on unregister — **fixed**

`src/automation/email-event-trigger.ts`, `src/automation/index.ts`

Confirmed: `unregisterAutomationNodes()` unregistered the node types but left the module-level
`subscriptions` map populated, so dead `emit` closures kept receiving after a reload.

Fix: `clearEmailEventSubscriptions()` is exported from the trigger module and called at the end of
`unregisterAutomationNodes()`.

Tests: `src/test/unit/automation.test.ts` — "stops fanning out once the subscriptions are cleared"
and "clears the subscriptions when the node types are unregistered". Red check performed: the second
fails with `expected [ Array(1) ] to have a length of +0` before the fix.

## 9. Tenant export streams through the archive — **fixed, real refactor**

`src/hooks/tenant-export.ts`

I read `cms/dist/interfaces/cms/tenant-export.d.ts`, `hooks.d.ts` and the archive implementation
(`cms/dist/utils/tenant-export-archive.js`) before touching anything. What they actually say:

- the handler signature is `(tenantId, archive: TenantExportArchive, signal: AbortSignal) =>
  TenantDataExportContribution | void`;
- `TenantExportArchive` is `addJson(path, data)`, `addFile(path, localPath)`, `addStream(path, stream)`;
- entries are namespaced under `modules/<moduleId>/…` and path traversal is stripped by the CMS;
- the archive **is** genuinely back-pressured: `ExportArchiveWriter.append` awaits archiver's `entry`
  event before resolving, so a slow zip stream throttles the producer;
- returning a contribution additionally writes the whole `data` blob to `modules/<moduleId>.json`.

The archive API expresses everything this contribution needs, so no compromise was necessary. The
contributor now:

- writes `templates.json`, `versions.json` and `segments.json` through `addStream`, each fed by
  `jsonArrayChunks` — an async generator that emits a well-formed JSON array while reading the table
  `TENANT_EXPORT_PAGE_SIZE = 200` rows at a time (`table.slice(offset, size)`, rows mapped through the
  model's `fromDatabase` so the JSON shape matches what `getAll()` used to produce);
- writes the small `settings.json` with `addJson` (still stripping `webhookSecret`);
- calls `signal.throwIfAborted()` between entries **and** between pages;
- returns nothing, so the CMS no longer writes a duplicate `modules/mailing.json` blob.

**Consumer-visible change:** mailing data moves from one `modules/mailing.json` object to
`modules/mailing/{templates,versions,segments,settings}.json`. That is the point of the fix, but it is
a format change for anything that reads a mailing tenant export.

`collectTenantMailingData` / `MailingTenantExport` are gone — nothing else referenced them.

Tests: `src/test/unit/tenant-export.test.ts` covers the pager (three pages read at growing offsets,
concatenation parses back to the exact rows; empty collection yields `[]`; an abort mid-stream throws
and issues no further read). `src/test/integration/tenant-export.test.ts` runs the real handler against
Mongo: it asserts the four entry names, that the handler returns `undefined`, that `settings.json`
carries no `webhookSecret`, that an already-aborted signal writes nothing, **and** — the part that
actually de-risks the refactor — that reading the templates table one row per page returns every slug
exactly once.

**A database-interface detail worth recording.** `Stream.slice(offset, count)` takes a *count*, not an
end index: the interface's own conformance test (`@antelopejs/interface-database`, `Slice()` in
`dist/tests/aggregation_operations.test.js`) asserts `slice(1, 2)` returns 2 documents starting at
index 1, and the integration test above confirms the behaviour on the Mongo backend. The CMS calls it
as `query.slice(i, i + EXPORT_BATCH_SIZE)` in `implementations/cms-base/table-view.ts:195` and
`db/models/userNotifications.model.ts`, i.e. as if the second argument were an end index — which makes
its export batches grow by one batch size per iteration. Out of scope here, but it is either an
upstream bug or an undocumented backend divergence, and it is worth a look before anyone copies that
pattern.

---

## Changes beyond the letter of the findings

Three, all small and all in service of the findings they sit next to:

1. **`deliverBatch` now catches too** (extension of finding 3). The finding named `deliverEach` and
   `recordAll`, but a `SendBatch()` rejection had the identical consequence the finding is about —
   the whole call dies, nothing is recorded, the failure is invisible in the log and the metrics. It
   now returns every recipient as `failed` with the exception message, so the batch shows up in the
   send log instead of vanishing behind a 500. Tested: "fails every recipient when the batch call
   itself throws".
2. **`stop()` became `async`** (needed by finding 7): the teardown has to be awaited to be destroyed
   deterministically and to be testable. It matches the CMS's own async `stop()`.
3. **`SendModel.listOlderThan` gained a required `pageSize`** (needed by finding 5). Retention is its
   only caller.

## Not changed on purpose

- No fallback to the non-idempotent `toUsers` in `notifyBounce` — see finding 4.
- `OUTCOME_SEVERITY` ranks all nine send statuses even though only `queued`/`sent`/`failed` can come
  out of a send call, so the map stays total and no status can silently fall through.
