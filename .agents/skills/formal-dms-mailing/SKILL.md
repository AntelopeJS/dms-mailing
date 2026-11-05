---
name: formal-dms-mailing
description: "Model-check with TLA+ how dms-mailing folds provider webhook events into a send (its status, opens and clicks, history rows and automation trigger) and how the nightly retention deletes sends and their history. Use when a change touches the webhook event handling or the send retention, when `dms-control formal` reports `webhook-events`, or to check a fix for one of its findings."
---

# Formal check of webhook events and retention

`MailingEvents.tla` models every database call of `recordEmailEvent` and of the retention's `purgeSend` and `purgeOrphanEvents` as one step. TLC explores every order of those steps for webhook deliveries that arrive out of order, twice, at the same time or after a failed attempt, while a retention run deletes the send. The status tables come from the code on each run, so a change to `RANK` reaches the model without an edit.

## Does the change touch it

The `webhook-events` entry of [`verify.config.ts`](../verify-dms-mailing/verify.config.ts) lists the covered files (`covers`). See what changed since the model last matched the code:

```bash
git diff 37b4ff69fdaadd710f5b2ce5080674d6ee9cc1c7..HEAD -- packages/dms-mailing/src/services/events.ts packages/dms-mailing/src/types/sends.ts packages/dms-mailing/src/db/models/sends.model.ts packages/dms-mailing/src/db/models/send-events.model.ts packages/dms-mailing/src/crons/retention.ts
```

Any change to a covered file breaks `ModelInSync`, which names the files. Read the change against the [coverage record](#coverage-record). A change to a function in it needs the model updated (see [Update the model](#update-the-model)) before the other rules mean anything. A change to the event types, `RANK`, `DEFERRABLE_STATUSES`, `COUNTERS` or `MAX_ACTIVITY_ATTEMPTS` needs no model edit, because `check.mjs` reads them on every run.

## Run

```bash
node .agents/skills/formal-dms-mailing/check.mjs        # both configurations, about 15 s
node .agents/skills/formal-dms-mailing/check.mjs race   # one configuration: fold or race
```

Run it from the repository root after `pnpm install`. It uses `checkSpec` of `@antelopejs/tooling-configs/formal`. That is TLC 1.7.4, downloaded once into `~/.cache/antelopejs-formal` and checked against its SHA-256, run by `$JAVA`, a `java` on `PATH`, or the `eclipse-temurin:21-jre` Docker image. In a verify run, `dms-control formal "$RUN"` runs it whenever the diff touches a covered file or this folder (see verify-dms-mailing's [SKILL.md](../verify-dms-mailing/SKILL.md)).

`check.mjs` first prints `ModelInSync`, then each configuration prints one line per rule:

- `holds A, B (N states)`. Every listed rule holds on every reachable state.
- `finding R: N states (recorded N)`. A recorded finding still breaks, with the same shortest counterexample length.
- `BROKEN R`. A rule recorded as holding breaks. Exit 1.
- `CHANGED R`. A finding breaks with a different shortest counterexample. Exit 1.
- `HOLDS R`. A recorded finding no longer breaks. Exit 1.

Exit 0 means every rule matches the record in `FINDINGS` of `check.mjs`. Exit 2 means TLC did not run, or `check.mjs` could not read a table from the code. The message names which.

## Rules

| Rule | Config | The rule | Harm when it breaks | Record |
| --- | --- | --- | --- | --- |
| `StatusFollowsEventTime` | fold | A send's status is what its accepted events give in the order the provider says they happened, whatever order the webhook delivers them in. | A delivered message shows `failed`, sits in the Problems tab, counts as a failure, and "send the failures again" mails the customer a second copy. | Finding, 9 states |
| `CountedOnce` | race | A provider event the webhook receives more than once adds at most one to the send's opens or clicks, at most one history row, and fires the automation trigger at most once. | Open and click counts are inflated, the history shows the event twice, and an automation on `mailing.email-event` runs twice. | Finding, 9 states |
| `RetentionSparesActiveSends` | race | Retention marks a send for deletion only if the webhook accepted no event for it since retention read it as inactive, and the webhook accepts no event into a send marked for deletion. | Retention deletes a send and its history while its recipient is engaging with it. | Holds |
| `NoOrphanEvents` | race | Once a retention run that started with no webhook request in flight finishes, no history row of a deleted send is left. | Event details (links clicked, user agents, bounce reasons) outlive the retention period the tenant set. | Holds |
| `TypeOK` | both | Every variable keeps its type. | A break is a modeling error, not a product bug. | Holds |
| `ModelInSync` | none | Every covered file still has the SHA-256 that `covered.json` recorded when the model was last read against the code. | The other rules describe code that is no longer there, so a passing run proves nothing about the change. | Holds |

## Findings

**`StatusFollowsEventTime`.** The provider defers a message (`failed`, `421 4.3.0`) and delivers it a minute later. The webhook receives `delivered` first, and `applyEvent` moves the send from `sent` to `delivered`. The deferral arrives next. `overridesStatus("delivered", "failed")` is true because `RANK.failed` is above `RANK.delivered`, and only a current status in `DEFERRABLE_STATUSES` gives way to a later sign of delivery. The send is stored `failed` with the deferral's reason, and `isProviderFailure` now selects it for `POST /sends/replay-failed`. In the order they happened, the same events give `delivered`. TLC's recorded shortest counterexample is the mirror case. `delivered` happened first and `failed` second, `failed` arrives first, and the send ends `delivered` where the events in time order give `failed`. Every pair of `failed` with `delivered`, `opened`, `clicked`, `unsubscribed` or `spam` depends on arrival order, because `overridesStatus` follows arrival order and never reads `event.at`. Emptying `DEFERRABLE_STATUSES` is not a fix on its own. `failed` and `bounced` share a rank, so the first to arrive would win. With no deferrable status and a distinct rank per event type, the rule holds on all 55,080 states.

**`CountedOnce`.** An `opened` event with an `eventId` reaches the webhook twice. Request 1 runs `isRepeatedEvent`, finds no stored row, and `recordActivity` writes `opens: 1`. Before request 1's `insertForActiveSend` writes the history row, request 2 runs `isRepeatedEvent`, finds no row either, and `recordActivity` writes `opens: 2`. Both insert a row and run `publishEmailEvent`. The requests need not overlap. When request 1 fails after `recordActivity` (the history insert throws, the process restarts, or `atomicMutation` answers `unknown` so `wasApplied` throws), the webhook answers 500, and the provider's retry finds no row and counts the event again. A run of the `race` model where the second request starts only after the first ended finds that path in 10 states.

## Read a result

Read every result with the pstack `/statechart` skill, a passing one as well as a broken one. For a broken rule it tells the shortest path in plain words. For a passing run it draws how the send and the requests move between states. Write the model it reads into a folder:

```bash
node .agents/skills/formal-dms-mailing/check.mjs --model "$TMPDIR/webhook-events"
```

The folder holds `MailingEvents.tla`, the generated `MailingTables.tla`, `fold.cfg` and `race.cfg`. When a rule differs from its record, `check.mjs` also prints `TLC output kept in <dir>`, with TLC's full trace in `<dir>/<rule>.out`.

Tell a product bug from a modeling error by replaying the path against the code. Map each step to its call through the [coverage record](#coverage-record). If the code allows every step in that order, it is a bug. Report it with the path in the code's words, and leave the rule as it is. If one step cannot happen in the code, the model is wrong at that step. Fix the action so it does what the call does, and say in the commit which call it now matches. A broken `TypeOK` is always a modeling error.

## Update the model

1. List what changed in the covered files since the sync commit (command in [Does the change touch it](#does-the-change-touch-it)).
2. For each changed function in the coverage record, make its action do what the code now does, with one action per database call. A new call is a new action and a new `pc` value. Add its row to the coverage record.
3. Run the check. A fix of a finding prints `HOLDS`. Remove the rule from `FINDINGS` in `check.mjs` and from [Findings](#findings). A rule that breaks after an intended change becomes a finding only once you have replayed its path against the code. Add it to `FINDINGS` with TLC's state count and describe it in Findings.
4. Only once you have read every covered function against its action, run `node .agents/skills/formal-dms-mailing/check.mjs --sync` to record the covered files' digests in `covered.json`. Commit the code change first, then set the sync commit below to the last commit that changed a covered file (`git log -1 --format=%H --` with the covered paths), and commit `covered.json`, the model and this file together.

## Model

The `fold` configuration checks the order of distinct events. Two events, each of any of the nine webhook event types, are each delivered once, in any order and interleaving, to a send that starts `queued`, `sent`, `delivered`, `failed` or `bounced`. No request fails and retention does not run. TLC explores 55,080 states.

The `race` configuration checks duplicates and retention. One event of any type is delivered up to twice. The two requests interleave freely, and either can stop at any step and answer 500. Up to two retention runs can stop at any step too, and the send's last activity can age past the retention limit between runs. TLC explores 637,947 states.

Assumptions, each a fact of the code at the sync commit:

- Each database call is one atomic step: a read, an insert, a delete by id, a `deleteBySend` filter delete, and an `atomicMutation` that compares `revision`.
- Every write to a send goes through `atomicMutation` and sets a new `revision` (`data/sends-table.ts` is read-only), so an equal `revision` means an unchanged row.
- A provider's retry carries the same identity (`eventId`, or the same type, `at` and details), so `isSameEvent` matches its stored row. The model compares events by identity, not by fields.
- Events carry distinct provider times. Without `at`, the arrival time is the event's time, so the two orders cannot differ.
- One tenant and one send, so retention's page loops read one page.
- `recent` stands for `lastActivityAt` being after the run's limit. It ages only between runs, because a run fixes its limit when it starts and lasts far less than `logRetentionDays`.
- `suppressAfterEvent` and `publishEmailEvent` are one step that counts the trigger.

Left out:

- The route (`routes/events.ts`), with its secret, its parsing and the settings' test event.
- The send's `error`, `stage`, `lastEventAt`, `isSoftBounce` and `provider` fields.
- `send.ts` (`record`, `aggregateResults` and `OUTCOME_SEVERITY`), imports (`send-import.ts`) and replays (`claimResolution`, `markReplayed`).
- The suppression list's contents, and several sends or tenants.
- At-least-once delivery of the trigger. No rule checks it. A scratch invariant on the `race` model found the gap in 9 states. A request that fails between the history insert and `publishEmailEvent` leaves a row, so the retry is answered as a repeat and the trigger never fires.

## Coverage record

| Action in `MailingEvents.tla` | Code |
| --- | --- |
| `IsRepeatedEventReadsSend` | `services/events.ts` `isRepeatedEvent`: `getByProviderMessageId` |
| `IsRepeatedEventReadsHistory` | `isRepeatedEvent`: `SendEventModel.getBySend`, then `isSameEvent` |
| `AcceptEmailActivityReadsSend` | `acceptEmailActivity`: `getByProviderMessageId`, `isRetiring` check |
| `RecordActivity` | `acceptEmailActivity` attempt loop, `activityOf`, `applyEvent`, `overridesStatus`; `db/models/sends.model.ts` `recordActivity`: `atomicMutation` on `revision` |
| `InsertForActiveSendInserts` | `db/models/send-events.model.ts` `insertForActiveSend`: `insert` |
| `InsertForActiveSendChecksSend` | `insertForActiveSend`: `SendModel.get`, `isRetiring` check |
| `InsertForActiveSendDeletes` | `insertForActiveSend`: `delete(id)` |
| `PublishEmailEvent` | `recordEmailEvent`: `suppressAfterEvent`, `publishEmailEvent` |
| `WebhookRequestFails` | any of the calls above throwing, so the route answers 500 |
| `RetentionStarts` | `crons/retention.ts` `purgeTenant`, `purgeInPages` |
| `ListOlderThan` | `sends.model.ts` `listOlderThan`, `canRetire` |
| `RetireReadsSnapshot` | `retire`: `getSnapshot`, `isInactive` |
| `RetireMutates` | `retire`: `atomicMutation` setting `isRetiring` |
| `RetireRereads` | `retire`: `get` after a lost mutation |
| `DeleteBySend` | `retention.ts` `purgeSend`: `SendEventModel.deleteBySend` |
| `DeleteRetiredReadsSnapshot` | `sends.model.ts` `deleteRetired`: `getSnapshot` |
| `DeleteRetiredMutates` | `deleteRetired`: `atomicMutation` delete on `revision` |
| `PurgeOrphanEventsLists` | `retention.ts` `purgeOrphanEvents`: `listAfter` |
| `PurgeOrphanEventsReadsSend` | `purgeOrphanEvents`: `sends.get` |
| `PurgeOrphanEventsDeletes` | `purgeOrphanEvents`: `deleteBySend` |
| `RetentionFails` | the job stopping at any step; the next run picks up `isRetiring` sends |
| `ActivityAges` | time passing beyond `logRetentionDays` between runs |
| `MailingTables.tla` | `services/events.ts` `RANK`, `DEFERRABLE_STATUSES`, `COUNTERS`, `MAX_ACTIVITY_ATTEMPTS`; `types/sends.ts` `SEND_EVENT_TYPES`, read by `check.mjs` |

Sync commit: `37b4ff69fdaadd710f5b2ce5080674d6ee9cc1c7` (2026-11-01). At that commit, every function above was read against its action, and `covered.json` holds the digests of the covered files as they are there.
