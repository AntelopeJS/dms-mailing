# @antelopejs/dms-mailing

> AntelopeJS DMS module for mailing: e-mail templates with a block editor, a send log and delivery metrics.

## Shape

The repository is a pnpm workspace: the root holds the tool configs (one
oxlint and oxfmt config for both packages), the two published packages live
under `packages/`. `pnpm run knip` checks only the dependencies of
`packages/dms-mailing`, with that package's own `knip.config.ts`. ESLint and Prettier own the Vue layer
(`packages/dms-mailing/frontend-vue`), not oxlint and oxfmt.

- `packages/dms-mailing/src/` — the whole server side. Pages are declared with DMS factories (`TableView`, `KpiCard`, `ChartCard`, `TopListCard`, `Section`, `Form` with sections), custom Vue only where the DMS has no block: `overview`, `templates`, the editor (`templates/:id`), `sends` and `settings`, all in the module sidebar. Every `CustomComponent` and the settings form carry a `.meta()` with `$dms_mailing.permissions.*` keys. Templates keep a draft (`json_draft`) next to the published content (`json_content`); publishing writes a row in `mailing_template_versions`.
- `packages/dms-mailing/src/engine/` — pure TS, no runtime dependency: a block tree resolves to an e-mail (token interpolation, conditions, list expansion) and can render itself to standalone HTML when the front end is unreachable.
- `packages/interface-dms-mailing/` — the separately published public interface other modules consume: `SendTemplate` and `RecordEmailEvent`, plus `DeclareTemplate` / `DeclareTemplateCategory` (content shipped as code, idempotent, never overwriting user edits) and `ImportSends` (past sends with their own dates).
- `packages/dms-mailing/frontend-vue/` — only what the DMS cannot express: the templates gallery (a TableView display), the drawers and dialogs, the block editor, the overview and settings blocks, and `app/emails/EmailMailingTemplate.vue`. `dms.frontend.ts` registers every component under the `Mailing` prefix (`MailingTemplateEditor`, `MailingBlockHero`…) and the plugins; the module's composables and utils are imported by path. `dms.email.ts` exposes server-only templates that share the DMS email branding.
- `packages/dms-mailing/docs/` — the user guide published on the DMS site (`/docs/modules/mailing`); `docs/design/design-v2-grill-me.md` is the decision log of the v2 redesign, kept out of the site.

## Tests

`pnpm run checks` runs only the Vue layer suite (`test:layer`, vitest). The
backend suite runs in its own CI job, so run it when your change touches
`packages/dms-mailing/src`:

- `pnpm --dir packages/dms-mailing test:backend` runs `ajs module test`, unit
  and integration, against a Mongo memory server and an SMTP fixture.
  `test:unit` and `test:integration` narrow it to one folder.
- The HTTP and command-line journeys, which each feature module of
  `e2e/journeys` exports as `apiJourneys`, run in that suite: one test per
  journey in `src/test/integration/<feature>.journeys.test.ts`, in-process, on
  a workspace reset before each, judged against its `knownFailures`.
- The backend scripts build the module first, and the test harness builds it
  again as the local module's `installCommand`. With `DMS_PREBUILT=1` (set in
  CI after its single build) both skip the build and test the existing `dist/`.
  Set it only after building the current sources; otherwise tests use stale
  output.
- `pnpm test:repo` runs the journeys suite's shape check
  (`test/journeys.test.mjs`) and the two TLA+ checks (`test/formal.test.mjs`)
  as `node:test` tests; `pnpm test` runs it first.
- `pnpm e2e` runs the browser journeys (`e2e/journeys`) as a Playwright suite
  through the `@antelopejs/dms/e2e` kit, which reads `e2e/journeys.config.ts`;
  `--grep @smoke` or `-g <journey id>` narrows it. `pnpm e2e:build` builds the
  module and the playground (`e2e/playground`, its packages from
  `e2e/playground-deps`) first;
  with `DMS_E2E_PREBUILT=1` the suite skips that build, as CI does. CI runs
  the `@smoke` set on a pull request, and every journey in the merge queue,
  nightly, on a manual run and with the `ci:full` label.
  A change to a journey runs that journey.
- A change to the webhook event handling or the send retention also runs the
  TLA+ check in
  [`.agents/skills/formal-dms-mailing/SKILL.md`](.agents/skills/formal-dms-mailing/SKILL.md).
- A change to how a template is created, to the slug's unique index or to
  `refuseTakenSlug` also runs the TLA+ check in
  [`.agents/skills/formal-template-slugs/SKILL.md`](.agents/skills/formal-template-slugs/SKILL.md).

`pnpm --dir packages/dms-mailing knip:all` also reports unused files and
exports. Confirm each finding before you remove it.

## Versions and releases

The module names its sibling interface with `workspace:^`, so `pnpm pack`
writes `^<sibling version>` and no release hook rewrites it. Release the interface first, then the module, through the **Release** workflow: dispatch it with `package-directory` set to `packages/interface-dms-mailing`, then to `packages/dms-mailing`.

<!-- antelopejs-guardrails:start -->
<!-- Managed by @antelopejs/tooling-configs. `antelopejs-sync` rewrites everything between these markers; write repository-specific guidance outside them. -->

## Guardrails

CI runs `pnpm run checks` in full on every pull request and reports what failed. The commit hook formats and lints the staged files. Locally, run only the fast check for what you touched:

- `pnpm run typecheck` after you change types or signatures.
- `pnpm exec oxlint <files>` and `pnpm exec oxfmt <files>` on the files you changed.
- One test file, not the suite. In a module that tests with `ajs module test`: `pnpm run build`, then `pnpm exec ajs module test . -f dist/<path>.test.js`.

Prove a change works before you call it done: run the journeys it touches with `pnpm e2e -g <journey id>`, and add a journey to `e2e/journeys/<feature>.mjs` when none covers it.

### Comments

Say it in code: a constraint in a type, a lint rule or a test, a public item's contract in TSDoc. Other comments are lint directives naming their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, and license or tool directives. A reason states what the code does now.

### Tests

Each test names the wrong implementation it fails on, or is deleted. Drive behaviour through the public interface. An invariant over many files is a lint rule.

### Review

No tool checks these:

- A type guard checks the nested elements and values it claims.
- A no-upward import rule rejects same-tier peers; probe it with an import.
- A finding only an evasion or a patched internal can trigger goes under Attention and never blocks.

### Suppressions

`guardrails.suppressions.json` caps lint directives, `@ts-expect-error`, `SAFETY:` comments and rules a lint config turns off. Over a cap, fix the code or remove another suppression of that kind; only the operator raises a number. After removing suppressions, run `pnpm run suppressions:update` and commit the file.

<!-- antelopejs-guardrails:end -->
