--------------------------- MODULE MailingEvents ---------------------------
EXTENDS Naturals, FiniteSets, Sequences, MailingTables

CONSTANTS NumEvents, Copies, InitialStatuses, Crashes, Retention, Runs

Events == 1..NumEvents
Deliveries == Events \X (1..Copies)
SendTimeRow == <<0, 0>>
EventOf(d) == d[1]

Stopped == {"idle", "answered", "failed"}
InFlight == {"readHistory", "readSend", "recordActivity", "insert", "checkSend", "deleteRow", "publish"}
RetentionSteps == {"idle", "listOlderThan", "retireReads", "retireMutates", "retireRereads",
                   "deleteEvents", "deleteRetiredReads", "deleteRetiredMutates",
                   "orphansList", "orphansReadSend", "orphansDelete"}
CounterFields == {Counters[t] : t \in DOMAIN Counters}

SendRecords == [exists : BOOLEAN, status : SendStatuses, opens : Nat, clicks : Nat,
                revision : Nat, retiring : BOOLEAN, recent : BOOLEAN]

VARIABLES eventType, initStatus,
          pc, snapshot, attempts,
          send, rows, nextRevision, emitted,
          accepted, activities, retiredOverActivity, acceptedWhileRetiring,
          rpc, runs, rRevision, rActivity, cleanStart, lastRunClean

fixedVars == <<eventType, initStatus>>
deliveryVars == <<pc, snapshot, attempts>>
storeVars == <<send, rows, nextRevision, emitted>>
ghostVars == <<accepted, activities, retiredOverActivity, acceptedWhileRetiring>>
retentionVars == <<rpc, runs, rRevision, rActivity, cleanStart, lastRunClean>>
vars == <<fixedVars, deliveryVars, storeVars, ghostVars, retentionVars>>

Overrides(current, next) ==
  IF current \in DeferrableStatuses
  THEN next # current /\ Rank[next] >= Rank["delivered"]
  ELSE Rank[next] > Rank[current]

StatusAfter(current, type) == IF Overrides(current, type) THEN type ELSE current

CountAfter(seen, type, field) ==
  IF type \in DOMAIN Counters /\ Counters[type] = field THEN seen[field] + 1 ELSE seen[field]

Init ==
  /\ eventType \in [Events -> SendEventTypes]
  /\ initStatus \in InitialStatuses
  /\ send = [exists |-> TRUE, status |-> initStatus, opens |-> 0, clicks |-> 0,
             revision |-> 0, retiring |-> FALSE, recent |-> FALSE]
  /\ rows = {SendTimeRow}
  /\ pc = [d \in Deliveries |-> "idle"]
  /\ snapshot = [d \in Deliveries |-> send]
  /\ attempts = [d \in Deliveries |-> 0]
  /\ nextRevision = 1
  /\ emitted = [e \in Events |-> 0]
  /\ accepted = {}
  /\ activities = 0
  /\ retiredOverActivity = FALSE
  /\ acceptedWhileRetiring = FALSE
  /\ rpc = "idle"
  /\ runs = 0
  /\ rRevision = 0
  /\ rActivity = 0
  /\ cleanStart = FALSE
  /\ lastRunClean = FALSE

Go(d, to) == pc' = [pc EXCEPT ![d] = to]

IsRepeatedEventReadsSend(d) ==
  /\ pc[d] = "idle"
  /\ Go(d, IF send.exists THEN "readHistory" ELSE "readSend")
  /\ UNCHANGED <<fixedVars, snapshot, attempts, storeVars, ghostVars, retentionVars>>

IsRepeatedEventReadsHistory(d) ==
  /\ pc[d] = "readHistory"
  /\ Go(d, IF \E row \in rows : row[1] = EventOf(d) THEN "answered" ELSE "readSend")
  /\ UNCHANGED <<fixedVars, snapshot, attempts, storeVars, ghostVars, retentionVars>>

AcceptEmailActivityReadsSend(d) ==
  /\ pc[d] = "readSend"
  /\ IF send.exists /\ ~send.retiring
     THEN /\ snapshot' = [snapshot EXCEPT ![d] = send]
          /\ Go(d, "recordActivity")
     ELSE /\ UNCHANGED snapshot
          /\ Go(d, "answered")
  /\ UNCHANGED <<fixedVars, attempts, storeVars, ghostVars, retentionVars>>

RecordActivity(d) ==
  LET seen == snapshot[d]
      type == eventType[EventOf(d)]
  IN
  /\ pc[d] = "recordActivity"
  /\ IF send.exists /\ send.revision = seen.revision
     THEN /\ send' = [send EXCEPT !.status = StatusAfter(seen.status, type),
                                  !.opens = CountAfter(seen, type, "opens"),
                                  !.clicks = CountAfter(seen, type, "clicks"),
                                  !.revision = nextRevision,
                                  !.recent = TRUE]
          /\ nextRevision' = nextRevision + 1
          /\ accepted' = accepted \cup {EventOf(d)}
          /\ activities' = activities + 1
          /\ acceptedWhileRetiring' = (acceptedWhileRetiring \/ send.retiring)
          /\ Go(d, "insert")
          /\ UNCHANGED attempts
     ELSE /\ attempts' = [attempts EXCEPT ![d] = @ + 1]
          /\ Go(d, IF attempts[d] + 1 < MaxActivityAttempts THEN "readSend" ELSE "failed")
          /\ UNCHANGED <<send, nextRevision, accepted, activities, acceptedWhileRetiring>>
  /\ UNCHANGED <<fixedVars, snapshot, rows, emitted, retiredOverActivity, retentionVars>>

InsertForActiveSendInserts(d) ==
  /\ pc[d] = "insert"
  /\ rows' = rows \cup {d}
  /\ Go(d, "checkSend")
  /\ UNCHANGED <<fixedVars, snapshot, attempts, send, nextRevision, emitted, ghostVars, retentionVars>>

InsertForActiveSendChecksSend(d) ==
  /\ pc[d] = "checkSend"
  /\ Go(d, IF send.exists /\ ~send.retiring THEN "publish" ELSE "deleteRow")
  /\ UNCHANGED <<fixedVars, snapshot, attempts, storeVars, ghostVars, retentionVars>>

InsertForActiveSendDeletes(d) ==
  /\ pc[d] = "deleteRow"
  /\ rows' = rows \ {d}
  /\ Go(d, "answered")
  /\ UNCHANGED <<fixedVars, snapshot, attempts, send, nextRevision, emitted, ghostVars, retentionVars>>

PublishEmailEvent(d) ==
  /\ pc[d] = "publish"
  /\ emitted' = [emitted EXCEPT ![EventOf(d)] = @ + 1]
  /\ Go(d, "answered")
  /\ UNCHANGED <<fixedVars, snapshot, attempts, send, rows, nextRevision, ghostVars, retentionVars>>

WebhookRequestFails(d) ==
  /\ Crashes
  /\ pc[d] \in InFlight
  /\ Go(d, "failed")
  /\ UNCHANGED <<fixedVars, snapshot, attempts, storeVars, ghostVars, retentionVars>>

Retirable == send.status # "queued" /\ ~send.recent

Finish ==
  /\ rpc' = "idle"
  /\ lastRunClean' = cleanStart

RetentionStarts ==
  /\ Retention
  /\ rpc = "idle"
  /\ runs < Runs
  /\ rpc' = "listOlderThan"
  /\ runs' = runs + 1
  /\ cleanStart' = \A d \in Deliveries : pc[d] \in Stopped
  /\ lastRunClean' = FALSE
  /\ UNCHANGED <<fixedVars, deliveryVars, storeVars, ghostVars, rRevision, rActivity>>

ListOlderThan ==
  /\ rpc = "listOlderThan"
  /\ rpc' = IF send.exists /\ (send.retiring \/ Retirable) THEN "retireReads" ELSE "orphansList"
  /\ UNCHANGED <<fixedVars, deliveryVars, storeVars, ghostVars, runs, rRevision, rActivity, cleanStart, lastRunClean>>

RetireReadsSnapshot ==
  /\ rpc = "retireReads"
  /\ IF send.exists /\ ~send.retiring /\ Retirable
     THEN /\ rpc' = "retireMutates"
          /\ rRevision' = send.revision
          /\ rActivity' = activities
     ELSE /\ rpc' = IF send.exists /\ send.retiring THEN "deleteEvents" ELSE "orphansList"
          /\ UNCHANGED <<rRevision, rActivity>>
  /\ UNCHANGED <<fixedVars, deliveryVars, storeVars, ghostVars, runs, cleanStart, lastRunClean>>

RetireMutates ==
  /\ rpc = "retireMutates"
  /\ IF send.exists /\ send.revision = rRevision
     THEN /\ send' = [send EXCEPT !.retiring = TRUE, !.revision = nextRevision]
          /\ nextRevision' = nextRevision + 1
          /\ retiredOverActivity' = (retiredOverActivity \/ activities # rActivity)
          /\ rpc' = "deleteEvents"
     ELSE /\ rpc' = "retireRereads"
          /\ UNCHANGED <<send, nextRevision, retiredOverActivity>>
  /\ UNCHANGED <<fixedVars, deliveryVars, rows, emitted, accepted, activities, acceptedWhileRetiring,
                 runs, rRevision, rActivity, cleanStart, lastRunClean>>

RetireRereads ==
  /\ rpc = "retireRereads"
  /\ rpc' = IF send.exists /\ send.retiring THEN "deleteEvents" ELSE "orphansList"
  /\ UNCHANGED <<fixedVars, deliveryVars, storeVars, ghostVars, runs, rRevision, rActivity, cleanStart, lastRunClean>>

DeleteBySend ==
  /\ rpc = "deleteEvents"
  /\ rows' = {}
  /\ rpc' = "deleteRetiredReads"
  /\ UNCHANGED <<fixedVars, deliveryVars, send, nextRevision, emitted, ghostVars,
                 runs, rRevision, rActivity, cleanStart, lastRunClean>>

DeleteRetiredReadsSnapshot ==
  /\ rpc = "deleteRetiredReads"
  /\ IF send.exists /\ send.retiring
     THEN /\ rpc' = "deleteRetiredMutates"
          /\ rRevision' = send.revision
     ELSE /\ rpc' = "orphansList"
          /\ UNCHANGED rRevision
  /\ UNCHANGED <<fixedVars, deliveryVars, storeVars, ghostVars, runs, rActivity, cleanStart, lastRunClean>>

DeleteRetiredMutates ==
  /\ rpc = "deleteRetiredMutates"
  /\ send' = IF send.exists /\ send.revision = rRevision THEN [send EXCEPT !.exists = FALSE] ELSE send
  /\ rpc' = "orphansList"
  /\ UNCHANGED <<fixedVars, deliveryVars, rows, nextRevision, emitted, ghostVars,
                 runs, rRevision, rActivity, cleanStart, lastRunClean>>

PurgeOrphanEventsLists ==
  /\ rpc = "orphansList"
  /\ IF rows # {}
     THEN /\ rpc' = "orphansReadSend"
          /\ UNCHANGED lastRunClean
     ELSE Finish
  /\ UNCHANGED <<fixedVars, deliveryVars, storeVars, ghostVars, runs, rRevision, rActivity, cleanStart>>

PurgeOrphanEventsReadsSend ==
  /\ rpc = "orphansReadSend"
  /\ IF send.exists
     THEN Finish
     ELSE /\ rpc' = "orphansDelete"
          /\ UNCHANGED lastRunClean
  /\ UNCHANGED <<fixedVars, deliveryVars, storeVars, ghostVars, runs, rRevision, rActivity, cleanStart>>

PurgeOrphanEventsDeletes ==
  /\ rpc = "orphansDelete"
  /\ rows' = {}
  /\ Finish
  /\ UNCHANGED <<fixedVars, deliveryVars, send, nextRevision, emitted, ghostVars, runs, rRevision, rActivity, cleanStart>>

RetentionFails ==
  /\ Crashes
  /\ rpc # "idle"
  /\ rpc' = "idle"
  /\ UNCHANGED <<fixedVars, deliveryVars, storeVars, ghostVars, runs, rRevision, rActivity, cleanStart, lastRunClean>>

ActivityAges ==
  /\ Retention
  /\ rpc = "idle"
  /\ send.exists
  /\ send.recent
  /\ send' = [send EXCEPT !.recent = FALSE]
  /\ UNCHANGED <<fixedVars, deliveryVars, rows, nextRevision, emitted, ghostVars, retentionVars>>

Done ==
  /\ \A d \in Deliveries : pc[d] \in Stopped
  /\ rpc = "idle"
  /\ UNCHANGED vars

Next ==
  \/ \E d \in Deliveries :
       \/ IsRepeatedEventReadsSend(d)
       \/ IsRepeatedEventReadsHistory(d)
       \/ AcceptEmailActivityReadsSend(d)
       \/ RecordActivity(d)
       \/ InsertForActiveSendInserts(d)
       \/ InsertForActiveSendChecksSend(d)
       \/ InsertForActiveSendDeletes(d)
       \/ PublishEmailEvent(d)
       \/ WebhookRequestFails(d)
  \/ RetentionStarts
  \/ ListOlderThan
  \/ RetireReadsSnapshot
  \/ RetireMutates
  \/ RetireRereads
  \/ DeleteBySend
  \/ DeleteRetiredReadsSnapshot
  \/ DeleteRetiredMutates
  \/ PurgeOrphanEventsLists
  \/ PurgeOrphanEventsReadsSend
  \/ PurgeOrphanEventsDeletes
  \/ RetentionFails
  \/ ActivityAges
  \/ Done

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ eventType \in [Events -> SendEventTypes]
  /\ initStatus \in SendStatuses
  /\ pc \in [Deliveries -> Stopped \cup InFlight]
  /\ snapshot \in [Deliveries -> SendRecords]
  /\ attempts \in [Deliveries -> 0..MaxActivityAttempts]
  /\ send \in SendRecords
  /\ rows \subseteq ({SendTimeRow} \cup Deliveries)
  /\ nextRevision \in Nat
  /\ emitted \in [Events -> Nat]
  /\ accepted \subseteq Events
  /\ rpc \in RetentionSteps
  /\ runs \in 0..Runs
  /\ CounterFields \subseteq {"opens", "clicks"}

RECURSIVE FoldFrom(_, _)
FoldFrom(status, events) ==
  IF events = <<>>
  THEN status
  ELSE FoldFrom(StatusAfter(status, eventType[Head(events)]), Tail(events))

InTimeOrder(set) == SelectSeq([i \in 1..NumEvents |-> i], LAMBDA e : e \in set)

StatusFollowsEventTime ==
  send.exists => send.status = FoldFrom(initStatus, InTimeOrder(accepted))

CountedOnce ==
  /\ \A field \in CounterFields :
       send[field] <= Cardinality({e \in Events : eventType[e] \in DOMAIN Counters /\ Counters[eventType[e]] = field})
  /\ \A e \in Events :
       /\ Cardinality({row \in rows : row[1] = e}) <= 1
       /\ emitted[e] <= 1

RetentionSparesActiveSends == ~retiredOverActivity /\ ~acceptedWhileRetiring

NoOrphanEvents == lastRunClean => (send.exists \/ rows = {})
=============================================================================
