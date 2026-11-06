--------------------------- MODULE TemplateSlugs ---------------------------
EXTENDS Integers, FiniteSets, SlugGuards

CONSTANTS Racers, Kinds, PreexistingChoices

Ids == 1..Racers
Rows == 0..Racers
NoRow == -1
Pending == [tag |-> "pending", row |-> NoRow]

PCs == {"idle", "declareInserts", "declareRereads", "newInitializes", "done"}
Tags == {"pending", "created", "kept", "conflict", "error"}
Answers == [tag : Tags, row : Rows \cup {NoRow}]

VARIABLES kind, preexisting, store, pc, answer

fixedVars == <<kind, preexisting>>
vars == <<fixedVars, store, pc, answer>>

Init ==
  /\ kind \in [Ids -> Kinds]
  /\ preexisting \in PreexistingChoices
  /\ store = IF preexisting THEN {0} ELSE {}
  /\ pc = [r \in Ids |-> "idle"]
  /\ answer = [r \in Ids |-> Pending]

Move(r, to) ==
  /\ pc' = [pc EXCEPT ![r] = to]
  /\ UNCHANGED answer

Finish(r, tag, row) ==
  /\ pc' = [pc EXCEPT ![r] = "done"]
  /\ answer' = [answer EXCEPT ![r] = [tag |-> tag, row |-> row]]

Taken == UniqueSlug /\ store # {}

DeclareReadsSlug(r) ==
  /\ kind[r] = "declare"
  /\ pc[r] = "idle"
  /\ IF store # {}
     THEN \E winner \in store : Finish(r, "kept", winner)
     ELSE Move(r, "declareInserts")
  /\ UNCHANGED <<fixedVars, store>>

DeclareInserts(r) ==
  /\ kind[r] = "declare"
  /\ pc[r] = "declareInserts"
  /\ IF Taken
     THEN /\ UNCHANGED store
          /\ IF DeclareKeepsWinner
             THEN Move(r, "declareRereads")
             ELSE Finish(r, "error", NoRow)
     ELSE /\ store' = store \cup {r}
          /\ Finish(r, "created", r)
  /\ UNCHANGED fixedVars

DeclareRereadsWinner(r) ==
  /\ kind[r] = "declare"
  /\ pc[r] = "declareRereads"
  /\ IF store # {}
     THEN \E winner \in store : Finish(r, "kept", winner)
     ELSE Finish(r, "error", NoRow)
  /\ UNCHANGED <<fixedVars, store>>

NewInserts(r) ==
  /\ kind[r] = "new"
  /\ pc[r] = "idle"
  /\ IF Taken
     THEN /\ UNCHANGED store
          /\ IF NewRefusesTaken /\ RefusesTakenSlug
             THEN Finish(r, "conflict", NoRow)
             ELSE Finish(r, "error", NoRow)
     ELSE /\ store' = store \cup {r}
          /\ Move(r, "newInitializes")
  /\ UNCHANGED fixedVars

NewInitializes(r) ==
  /\ kind[r] = "new"
  /\ pc[r] = "newInitializes"
  /\ Finish(r, "created", r)
  /\ UNCHANGED <<fixedVars, store>>

DuplicateInserts(r) ==
  /\ kind[r] = "duplicate"
  /\ pc[r] = "idle"
  /\ IF Taken
     THEN /\ UNCHANGED store
          /\ IF DuplicateRefusesTaken /\ RefusesTakenSlug
             THEN Finish(r, "conflict", NoRow)
             ELSE Finish(r, "error", NoRow)
     ELSE /\ store' = store \cup {r}
          /\ Finish(r, "created", r)
  /\ UNCHANGED fixedVars

Next ==
  \E r \in Ids :
    \/ DeclareReadsSlug(r)
    \/ DeclareInserts(r)
    \/ DeclareRereadsWinner(r)
    \/ NewInserts(r)
    \/ NewInitializes(r)
    \/ DuplicateInserts(r)

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ kind \in [Ids -> Kinds]
  /\ preexisting \in BOOLEAN
  /\ store \subseteq Rows
  /\ pc \in [Ids -> PCs]
  /\ answer \in [Ids -> Answers]

OneTemplatePerSlug == Cardinality(store) <= 1

Answered(tag) == {r \in Ids : answer[r].tag = tag}

LosersFailCleanly ==
  /\ Answered("error") = {}
  /\ \A r \in Answered("created") \cup Answered("kept") : answer[r].row \in store
  /\ Cardinality(Answered("created")) <= 1

OneWinner == Answered("pending") = {} => Cardinality(store) = 1
=============================================================================
