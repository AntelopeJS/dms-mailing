---
name: verify-dms-mailing
description: "Drive the AntelopeJS dms-mailing module (e-mail templates and their gallery, the block editor with drafts and versions, the send log, the Overview figures, the settings with the provider webhook, the suppression list, the interface other modules send and declare through) the way the platform owner does, inside a DMS with free ports, its own MongoDB database and an SMTP sink, and post a verdict with evidence. Use to prove a change to AntelopeJS/dms-mailing works before merge, to verify a PR, or to check that a seeded break or a seeded one-way door is caught."
---

# Verify dms-mailing

Every deterministic step is a `dms-control` command. You choose which journeys to run and judge what they show; you never write a multi-step shell recipe. When a journey you need does not exist, add it to `journeys/<feature>.mjs`, describe it in its feature file, and run it.

`dms-control` is the bin of `@antelopejs/dms`, a devDependency of `packages/dms-mailing`. Run it with Node 24 after `pnpm install`, through that package:

```bash
C="pnpm --dir packages/dms-mailing exec dms-control"
$C                       # lists every command
```

Give `seeded`, `doors` and `--skill` absolute paths: the command runs in `packages/dms-mailing`.

## Launch

```bash
RUN=$($C up --prepare --base origin/campaign/integration)   # installs, builds, starts; prints the run folder
```

`--prepare` runs the `prepare` commands of `verify.config.ts`: the frozen install, the build of the interface and the module, `playwright-core` into this folder, the frozen install of `deps/` (the playground's packages, linked as `playground/node_modules`) and the TypeScript build of the playground's fixture module. Without it `up` uses the builds already there, and `doctor` fails on a stale one. `up` starts an isolated DMS from `playground/`:

- the checkout is laid out again under `$RUN/root`, every sibling linked, and the playground copied without `node_modules`, so the run's build, `.antelope/` and data are its own;
- the API, the dashboard and the SMTP sink get free ports from the kernel, and `HOME` is `$RUN/home`;
- a `mongod` the run owns serves `verify_<run>` databases;
- the backend runs `ajs project start -e docs`, the dashboard `ajs dms start -e docs -b <api>`;
- the `nodemailer` module sends to the run's SMTP sink, so every e-mail the module sends is readable with `$C mail "$RUN"` and in `ctx.mail`.

The fixture module (`playground/src`) serves what a journey cannot do over the module's own HTTP API, under `/verify-mailing`: a member with a role (`POST /member`) and `POST /call`, which calls one function of `@antelopejs/interface-dms-mailing` (`send`, `record`, `template`, `category`, `sender`, `import`: SendTemplate, RecordEmailEvent, DeclareTemplate, DeclareTemplateCategory, DeclareSender, ImportSends) with the arguments exactly as the journey wrote them and answers what it resolved with or how it rejected. `{ "$date": "<ISO string>" }` in an argument becomes a `Date`. With `VERIFY_MAILING_DECLARE=<file>` the fixture runs the calls the file lists from `Hook.TENANT_BEING_PROVISIONED`, as the docs tell a project to. `VERIFY_MAILING_PROVIDER=down` points the provider at a port nothing listens on, and `VERIFY_MAILING_HTML_RENDER=0|1` sets the module's `useHtmlRender`.

## Doctor

```bash
$C doctor "$RUN"          # prints only failing checks; --verbose prints all
```

Do not drive a run that fails doctor.

## Drive

```bash
$C plan --base origin/campaign/integration   # the diff mapped to features; unmapped surfaces
$C journey "$RUN" smoke
$C journey "$RUN" sends [journey-id...]
```

- Each feature file in [features/](features/README.md) lists its source globs (`covers:`), its docs pages (`docs:`) and its journeys; the journeys are in `journeys/<feature>.mjs` and `journeys/parts/`, with the helpers they share in `mailing.mjs` (requests, checks, `calling` for the interface functions, `member`, `withConfig`, `raw`) and `guard.mjs` (environment loss). [coverage/](coverage) holds one table per feature: every documented behaviour, its catching journey and check, or `Not driven` with the reason.
- A journey starts on an empty database with the administrator onboarded and the backend restarted on it, so settings and configuration switches are gone. It reads every mutation back through a second view: the API, a reload, the mail sink, the stored rows or a backend restart.
- `withConfig(ctx, { VERIFY_MAILING_*: … }, body)` restarts the backend with the playground's switches set and restarts it again without them.
- To look at the product yourself: `$C onboard "$RUN"`, `$C browser "$RUN" login`, `goto --path`, `snapshot`, `click --role --name`, `fill`, `press`, `screenshot`, `$C api "$RUN" <method> <path> [--as anon] [--body <json>]`, `$C reset "$RUN"`. Each writes its evidence under `$RUN/evidence/`.

## Evidence

Everything goes under `$RUN/evidence/`: `<feature>/<journey>/NN-<step>/` with `action.json`, `url.txt`, `aria.yml` and `screenshot.png` for a browser step, `request.json` and `response.json` (status, headers, size and SHA-256 of the body) for a request, `mail.json` for the messages the sink received, and `checks.json` for every step that checks something; `<feature>/<journey>/result.json` and `<feature>/feature.json`. Read the evidence before you judge a PASS: a check passing proves only what it asserts.

## Cleanup

```bash
$C down "$RUN"
```

## Verdict rules

1. **Run every feature whose `covers:` globs the diff touches, plus the smoke journey.** `plan` prints that list as `run`.
2. **Unmapped surface fails the verdict.** User-facing code is `packages/dms-mailing/src/**`, `frontend-vue/**`, `skills/**`, `package.json`, and `packages/interface-dms-mailing/src/**` and `package.json`, tests and tool configs excluded (`verify.config.ts`). `map` checks the whole tree.
3. **Every registered journey of a feature in `run` must have run and passed.** Known findings stay as failing journeys (see Gotchas): they fail a verdict only when the diff touches their feature.
4. **Docs.** Judge every `docs:` page of each touched feature against what the journeys showed.
5. **One-way doors.** The section comes right after the result line and is mandatory. `$C doors` prints the `One-way-door:` line for the diff. The Data door is contained only by its containment journeys passing in this run, the Outbound door by `suppressions/a-suppressed-address-gets-no-mail-from-any-send-path` and `sends/a-real-send-asks-for-an-acknowledgement`; no journey contains the other kinds, so those rows say so.
6. **Result.** FAIL if any of rules 1 to 5 fail. PASS+NOTES when something is not verified or needs the owner's attention. PASS otherwise.

Write `$RUN/evidence/judgement.json` (`doors`, `docs`, `notVerified`, `attention`, `verifier`), then `$C verdict "$RUN" --pr <n>` and, from a thread that did not write the change, `$C publish "$RUN" --pr <n>`.

## Trust

The skill is not Trusted yet. It becomes Trusted when it catches every seeded break and flags every seeded door, passes a shadow run of 10 consecutive agent PRs, and its last maintain pass is newer than the last change to the repository or its `@antelopejs` dependencies and at most 30 days old.

## Seeded breaks and doors

```bash
$C seeded smoke sends suppressions
$C doors "$PWD/.agents/skills/verify-dms-mailing/seeded-doors/data.patch"
```

`seeded-breaks/<feature>.patch` is one minimal product bug per feature; `seeded` builds a control and a patched worktree, runs the feature's journeys in each, and prints `CAUGHT` with the journeys that caught it, or `MISSED`. A break counts only when a journey that passes in the control fails one of its checks with the patch. `seeded-doors/<kind>.patch` holds one change per door kind.

## Gotchas

- The playground resolves its packages from `deps/` (its own lockfile), not from the module, so the fixture module declares no dependency of its own: a dependency in `playground/package.json` would make the project load the unreleased `@antelopejs/interface-dms` tarball for the whole DMS, and the sign-in answers 500 (`testHashAsync is not a function`).
- Every dashboard page renders on the server and hydrates after `load`; a click that lands first does nothing. The journeys click again until what the click opens shows, and `tab.signIn` waits for the sign-in form to hydrate.
- A step whose check fails because the backend or the dashboard stopped answering ends the journey with a `NOT VERIFIED` error and no failing check (`guard.mjs`), so `seeded` never counts an outage as a catch.
- `mongod` comes from `DMS_CONTROL_MONGOD`, `PATH`, or the mongodb-memory-server cache (`~/.cache/mongodb-binaries`).
- Known findings at the integration head are failing journeys, each with an issue draft; the list is in the pull request's Attention section.

## Not driven

List these under `notVerified` in the judgement of every verdict. The per-feature reasons are in [coverage/](coverage).

- The daily jobs (the 03:15 retention sweep, the attention refresh): a journey cannot wait for the clock.
- The automation nodes (`mailing.send-template`, `mailing.email-event`): the playground loads no module that implements `@antelopejs/interface-dms-automation`.

## Feature map

[features/README.md](features/README.md).
