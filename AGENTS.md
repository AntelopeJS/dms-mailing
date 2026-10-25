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
- `packages/dms-mailing/frontend-vue/` — only what the DMS cannot express: the templates gallery (a TableView display), the drawers and dialogs, the block editor, the overview and settings blocks, and `app/emails/EmailMailingTemplate.vue`. `dms.frontend.ts` registers every component under the `Mailing` prefix (`MailingEditor`, `MailingBlockHero`…) and the plugins; the module's composables and utils are imported by path. `dms.email.ts` exposes server-only templates that share the DMS email branding.
- `packages/dms-mailing/docs/` — the user guide published on the DMS site (`/docs/modules/mailing`); `docs/design/design-v2-grill-me.md` is the decision log of the v2 redesign, kept out of the site.

## Tests

`pnpm run checks` runs only the Vue layer suite (`test:layer`, vitest). The
backend suite runs in its own CI job, so run it when your change touches
`packages/dms-mailing/src`:

- `pnpm --dir packages/dms-mailing test:backend` runs `ajs module test`, unit
  and integration, against a Mongo memory server and an SMTP fixture.
  `test:unit` and `test:integration` narrow it to one folder.
- The backend scripts build the module first, and the test harness builds it
  again as the local module's `installCommand`. With `DMS_PREBUILT=1` (set in
  CI after its single build) both skip the build and test the existing `dist/`.
  Set it only after building the current sources; otherwise tests use stale
  output.

`pnpm --dir packages/dms-mailing knip:all` also reports unused files and
exports. Confirm each finding before you remove it.

## Versions and releases

The module implements the interface, so `packages/dms-mailing` caps its
interface range below the next minor (`>=<floor> <0.<minor+1>.0`); inside the
workspace that range resolves to the sibling package. `release.yml` refuses any
other shape. Release the interface first (**Release DMS mailing interface**),
then the module (**Release DMS mailing module**), which refuses to run until
the version in `packages/interface-dms-mailing/package.json` resolves on npm.

## Orb

`.agents/setup` belongs to the guardrail pack. The AntelopeJS CLI, MongoDB and
the playground build live in `.agents/playground`, which the
`dms-mailing-backend` service runs before it starts.

<!-- antelopejs-guardrails:start -->
<!-- Managed by @antelopejs/tooling-configs. `antelopejs-sync` rewrites everything between these markers; write repository-specific guidance outside them. -->

## Guardrails

Finish every change with `pnpm run checks`. It runs typecheck, lint, format, knip, tests, size, ratchet, and sync, and prints only what failed. The change is done when it prints no failure.

The tools enforce most rules, listed in the table at the end. The sections below hold the rules no tool checks.

### Comments

Say it in code. A constraint belongs in a type, a lint rule, or a test. A public item's contract belongs in TSDoc (`/** */`) on that item. The only other comments are lint directives that name their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, `/*!` license headers, and bundler or formatter directives.

### Tests

Hold every test you write or keep to this checklist:

- Name the wrong implementation this test fails on. A test with no answer is deleted, not kept.
- No test reads the file it tests. Drive the behaviour through the public interface.
- An invariant over many files is a lint rule, not a test.

### Debt

`guardrails.ratchet.json` records the lint findings and oversize files this repository already had. Its numbers only go down. After you remove debt, run `pnpm run ratchet:update` and commit the lowered file. A rule listed there is off for `oxlint`. The ratchet counts it instead, and the pre-commit hook rejects it on every line you add.

### What enforces what

| Rule                                                                           | Enforced by                               |
| ------------------------------------------------------------------------------ | ----------------------------------------- |
| Formatting                                                                     | oxfmt                                     |
| Lint findings are errors; no rule warns                                        | oxlint preset                             |
| Comments are TSDoc, directives, or `SAFETY:` only                              | `antelopejs/no-comments`                  |
| Every test asserts                                                             | `antelopejs/require-assertion`            |
| Tests read no files outside fixtures, helpers, locales                         | `antelopejs/no-fs-read-in-tests`          |
| No assertion that restates a constant                                          | `antelopejs/no-constant-value-assertion`  |
| No test whose only check is "is a function"                                    | `antelopejs/no-typeof-function-only-test` |
| Params ≤ 5, function ≤ 120 lines, file ≤ 500 lines, depth ≤ 4, complexity ≤ 20 | `eslint/max-*`, `eslint/complexity`       |
| Files ≤ 20,000 bytes, tests included                                           | `antelopejs-check-size` (pre-commit)      |
| Existing debt only shrinks                                                     | `antelopejs-ratchet`                      |
| Types check                                                                    | `tsc` (pre-push)                          |
| No dead files, exports, or dependencies                                        | knip                                      |
| Managed files match the pack                                                   | `antelopejs-sync --check`                 |
| A test names the wrong implementation it catches                               | review; no tool                           |

<!-- antelopejs-guardrails:end -->
