---
name: formal-template-slugs
description: "Model-check with TLA+ that creations of one template slug that race (the templates table's `new`, a duplicate, and a code declaration) leave exactly one template holding the slug and fail every other creation cleanly. Use when a change touches how a template is created, the slug's unique index or `refuseTakenSlug`, when `dms-control formal` reports `template-slugs`, or to check a fix for one of its findings."
---

# Formal check of template slug creation races

`TemplateSlugs.tla` models every database call that gives a template its slug as one step. Three kinds of creation race for one slug: the data API's `new`, the `duplicate` route and `declareTemplate`. TLC explores every order of those steps, with and without a template that already holds the slug. The guards (the unique index, the 409 mapping, the declaration's re-read) come from the code on each run, so a revert of PR #68 reaches the invariants without a model edit.

## Does the change touch it

The `template-slugs` entry of [`verify.config.ts`](../verify-dms-mailing/verify.config.ts) lists the covered files (`covers`). See what changed since the model last matched the code:

```bash
git diff 7be1f0884d0f9c160f45d1c1bc99a28687173be1..HEAD -- packages/dms-mailing/src/db/tables/templates.table.ts packages/dms-mailing/src/services/templates.ts packages/dms-mailing/src/data/templates-table.ts packages/dms-mailing/src/routes/templates.ts packages/dms-mailing/src/services/declarations.ts packages/dms-mailing/src/db/models/templates.model.ts
```

Any change to a covered file breaks `ModelInSync`, which names the files. Read the change against the [coverage record](#coverage-record). A change to a function in it needs the model updated (see [Update the model](#update-the-model)) before the other rules mean anything. A new code path that inserts a template is a new kind of racer and needs a new action, and its file goes into `covers`. `dms-control formal` runs this check only when the diff touches `covers` or this folder, so a creation path added in another file goes unchecked until then.

## Run

```bash
node .agents/skills/formal-template-slugs/check.mjs   # about 2 s
```

Run it from the repository root after `pnpm install`. It uses `checkSpec` of `@antelopejs/tooling-configs/formal`. That is TLC 1.7.4, downloaded once into `~/.cache/antelopejs-formal` and checked against its SHA-256, run by `$JAVA`, a `java` on `PATH`, or the `eclipse-temurin:21-jre` Docker image. In a verify run, `dms-control formal "$RUN"` runs it whenever the diff touches a covered file or this folder (see verify-dms-mailing's [SKILL.md](../verify-dms-mailing/SKILL.md)).

`check.mjs` first prints `ModelInSync`, then one line per rule:

- `holds A, B (N states)`. Every listed rule holds on every reachable state.
- `finding R: N states (recorded N)`. A recorded finding still breaks, with the same shortest counterexample length.
- `BROKEN R`. A rule recorded as holding breaks. Exit 1.
- `CHANGED R`. A finding breaks with a different shortest counterexample. Exit 1.
- `HOLDS R`. A recorded finding no longer breaks. Exit 1.

Exit 0 means every rule matches the record in `FINDINGS` of `check.mjs`. Exit 2 means TLC did not run, or `check.mjs` could not read a covered file.

A guard that the code no longer has is not an error. `check.mjs` reads it as `FALSE`, and the rules below say what that breaks.

## Rules

| Rule | The rule | Harm when it breaks | Record |
| --- | --- | --- | --- |
| `OneTemplatePerSlug` | At most one template holds a slug. | Sends name a template by its slug, so two templates with one slug leave a send without a single template to render. | Holds |
| `LosersFailCleanly` | No creation answers with a server error. Every `created` or `kept` answer names a template that holds the slug. At most one creation answers `created`. | A person who loses the race sees a 500 instead of "slug taken", or a project that declares its templates at start crashes on a second instance. | Holds |
| `OneWinner` | Once every creation has answered, exactly one template holds the slug. | The slug ends up with no template, or with two. | Holds |
| `TypeOK` | Every variable keeps its type. | A break is a modeling error, not a product bug. | Holds |
| `ModelInSync` | Every covered file still has the SHA-256 that `covered.json` recorded when the model was last read against the code. | The other rules describe code that is no longer there, so a passing run proves nothing about the change. | Holds |

## Findings

None. Every rule holds at the sync commit. The check is built to fail when the fix is reverted, and each of these scratch changes was seen to break it, also after `--sync`:

- `@Index({ unique: true })` becomes `@Index()` on `slug`. `OneTemplatePerSlug` breaks: a template already holds the slug, a creation inserts a second one.
- The `duplicate` route inserts without `refuseTakenSlug`. `LosersFailCleanly` breaks: the duplicate-key error is not mapped, so the loser gets a 500.
- `createDeclared` rethrows a duplicate-key error instead of returning `undefined`. `LosersFailCleanly` breaks: the declaration that loses the race throws.
- `refuseTakenSlug` returns the write without `await`. `LosersFailCleanly` breaks: the rejection skips the catch, so a losing `new` or `duplicate` gets a 500.
- `createDeclared` inserts before its `try`, which then holds only the read. `LosersFailCleanly` breaks: the duplicate-key error escapes.
- The slug's unique index gets a `group` shared with another column, or another column joins the `slug` group. `OneTemplatePerSlug` breaks: the slug is then unique only together with that column.
- `createDeclared` wraps the insert in an inner `try` whose catch rethrows a new error. `LosersFailCleanly` breaks: the outer catch no longer sees a duplicate-key error.

## Read a result

Read every result with the pstack `/statechart` skill, a passing one as well as a broken one. For a broken rule it tells the shortest path in plain words. For a passing run it draws how the creations move between states. Write the model it reads into a folder:

```bash
node .agents/skills/formal-template-slugs/check.mjs --model "$TMPDIR/template-slugs"
```

The folder holds `TemplateSlugs.tla`, the generated `SlugGuards.tla` and `slugs.cfg`. When a rule differs from its record, `check.mjs` also prints `TLC output kept in <dir>`, with TLC's full trace in `<dir>/<rule>.out`.

Tell a product bug from a modeling error by replaying the path against the code. Map each step to its call through the [coverage record](#coverage-record). If the code allows every step in that order, it is a bug. Report it with the path in the code's words, and leave the rule as it is. If one step cannot happen in the code, the model is wrong at that step. Fix the action so it does what the call does, and say in the commit which call it now matches. A broken `TypeOK` is always a modeling error.

A `BROKEN` rule right after a code change usually means a guard now reads `FALSE`. Open the generated `SlugGuards.tla` (`--model`) to see which one, then read the matching function in the code. If the guard is still there in a new shape, update the pattern in `check.mjs`.

## Update the model

1. List what changed in the covered files since the sync commit (command in [Does the change touch it](#does-the-change-touch-it)).
2. For each changed function in the coverage record, make its action do what the code now does, with one action per database call. A new call is a new action and a new `pc` value. A new guard is a new constant in `guardsModule` of `check.mjs`. Add its row to the coverage record.
3. Run the check. A fix of a finding prints `HOLDS`. Remove the rule from `FINDINGS` in `check.mjs`. A rule that breaks after an intended change becomes a finding only once you have replayed its path against the code. Add it to `FINDINGS` with TLC's state count and describe it in Findings.
4. Only once you have read every covered function against its action, run `node .agents/skills/formal-template-slugs/check.mjs --sync` to record the covered files' digests in `covered.json`. Commit the code change first, then set the sync commit below to the last commit that changed a covered file (`git log -1 --format=%H --` with the covered paths), and commit `covered.json`, the model and this file together.

## Model

`slugs.cfg` runs three creations. Each one is a `new`, a `duplicate` or a `declare`, in any mix, and each does one creation. A template that already holds the slug exists or not. TLC explores 1,048 states.

The store is the set of template ids that hold the slug. Creation `r` adds the id `r`. The id `0` is the template that held the slug before the race. Each creation ends with one answer: `created`, `kept` (a declaration that found the slug taken), `conflict` (the 409) or `error` (a 500).

An insert on a taken slug depends on `UniqueSlug`. With the unique index, the database raises a duplicate-key error. The path then answers `conflict` when it wraps the insert in `refuseTakenSlug`, `kept` when it is a declaration that re-reads the winner, and `error` otherwise. Without the index, the insert succeeds and adds a second template.

Assumptions, each a fact of the code at the sync commit:

- Each database call is one atomic step. The unique index decides a race between two inserts in the database, so one of them wins.
- The slug is immutable after creation (`assertEditable` refuses a change), and no code path other than the three above inserts a template. `initializeTemplate` writes other fields only.
- Creations belong to one tenant. Each request runs once and is never retried.
- A request that reaches a database call finishes it. A crash between calls is not modeled.
- `getBySlug` returns any one template that holds the slug.

Left out:

- Deleting a template. It needs the template archived first, which is a user action, and it only frees the slug.
- Databases that do not enforce unique indexes. The module needs a database module that enforces unique indexes, such as `@antelopejs/mongodb` or `@antelopejs/postgres`, and RethinkDB refuses the schema. The check models a database that does enforce them (`UniqueSlug`).
- The reads of other tables: the settings, the starter or the source template that seeds a creation, the user lookup, and the attention refresh after a creation.
- The validation of the body, the category and the permissions.
- Several tenants. The index is per tenant.

## Coverage record

| Action in `TemplateSlugs.tla` | Code |
| --- | --- |
| `DeclareReadsSlug` | `services/declarations.ts` `declareTemplate`: `getBySlug`, answers `kept` when a template holds the slug |
| `DeclareInserts` | `declarations.ts` `createDeclared`: `insertFields` inside the `try`, whose `IsDuplicateKeyError` catch returns `undefined` (`DeclareKeepsWinner`); `db/models/templates.model.ts` `insertFields` |
| `DeclareRereadsWinner` | `declareTemplate`: `getBySlug` after `createDeclared`, answers `kept` or throws "disappeared"; `templates.model.ts` `getBySlug` |
| `NewInserts` | `data/templates-table.ts` `withSeeding`: `refuseTakenSlug(base.func.call(...))` (`NewRefusesTaken`) |
| `NewInitializes` | `withSeeding`: `initializeTemplate`, `services/templates.ts` `initializeTemplate`: `updateFields` |
| `DuplicateInserts` | `routes/templates.ts` `duplicate`: `refuseTakenSlug(this.templates.insertFields(...))` (`DuplicateRefusesTaken`) |
| `RefusesTakenSlug` in `SlugGuards.tla` | `services/templates.ts` `refuseTakenSlug`: the `try` returns `await write`, and `IsDuplicateKeyError` on the `slug` field becomes `HTTPResult(HTTP_CONFLICT, ...)` |
| `UniqueSlug` in `SlugGuards.tla` | `db/tables/templates.table.ts`: `@Index({ unique: true })` on `declare slug`, with no `group`, and no other column in the `slug` group |

`check.mjs` reads the five guards of `SlugGuards.tla` out of the code with patterns. It reads a missing guard as `FALSE`, and exits 2 only when a covered file cannot be read.

Sync commit: `7be1f0884d0f9c160f45d1c1bc99a28687173be1` (2026-11-04). At that commit, every function above was read against its action, and `covered.json` holds the digests of the covered files as they are there.
