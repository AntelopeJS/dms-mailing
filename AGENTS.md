# @antelopejs/dms-mailing

> AntelopeJS DMS module for mailing: e-mail templates with a block editor, a send log and delivery metrics.

## Shape

The repository is a pnpm workspace: the root holds tooling only, the two
published packages live under `packages/`.

- `packages/dms-mailing/src/` — the whole server side. Pages are declared with DMS factories (`TableView`, `KpiCard`, `ChartCard`, `TopListCard`, `Section`, `Form` with sections), custom Vue only where the DMS has no block: `overview`, `templates`, the editor (`templates/:id`), `sends` and `settings`, all in the module sidebar. Every `CustomComponent` and the settings form carry a `.meta()` with `$dms_mailing.permissions.*` keys. Templates keep a draft (`json_draft`) next to the published content (`json_content`); publishing writes a row in `mailing_template_versions`.
- `packages/dms-mailing/src/engine/` — pure TS, no runtime dependency: a block tree resolves to an e-mail (token interpolation, conditions, list expansion) and can render itself to standalone HTML when the front end is unreachable.
- `packages/interface-dms-mailing/` — the separately published public interface other modules consume: `SendTemplate` and `RecordEmailEvent`, plus `DeclareTemplate` / `DeclareTemplateCategory` (content shipped as code, idempotent, never overwriting user edits) and `ImportSends` (past sends with their own dates).
- `packages/dms-mailing/frontend-vue/` — only what the DMS cannot express: the templates gallery (a TableView display), the drawers and dialogs, the block editor, the overview and settings blocks, and `app/emails/EmailMailingTemplate.vue`. `dms.frontend.ts` registers every component under the `Mailing` prefix (`MailingEditor`, `MailingBlockHero`…) and the plugins; the module's composables and utils are imported by path. `dms.email.ts` exposes server-only templates that share the DMS email branding.
- `packages/dms-mailing/docs/` — the user guide published on the DMS site (`/docs/modules/mailing`); `docs/design/design-v2-grill-me.md` is the decision log of the v2 redesign, kept out of the site.

## Testing

The test scripts all live in `packages/dms-mailing`; the root forwards only
`build`, `lint`, `typecheck`, `knip` and `test` to it.

- `pnpm --dir packages/dms-mailing test` runs both suites: `test:backend`
  (`ajs module test`, unit + integration against a Mongo memory server and an
  SMTP fixture) then `test:layer` (vitest over the Vue layer). Both run on
  their own too, and `test:unit` / `test:integration` narrow the backend run to
  one folder.
- The backend scripts build the module first, and the test harness builds it
  again as the local module's `installCommand`. With `DMS_PREBUILT=1` (set in
  CI after its single build) both skip the build and test the existing `dist/`.
  Set it only after building the current sources; otherwise tests use stale output.

## Code conventions

- Write code, identifiers, and comments in English.
- Use pnpm for package management and repository scripts.
- Follow the repository's lint and formatting configuration.
- Prefer the smallest change that solves the task; generalize for an existing need.
- Keep functions focused. Extract helpers when they clarify a responsibility, not just to meet a line count.
- Explain non-obvious constraints and decisions in comments; avoid restating the code. Document public contracts with TSDoc.
- Use objects, maps, or arrays instead of `switch/case`.
- Use named interfaces or types instead of anonymous object types.
- Give non-obvious values named constants.
- Prefer early returns to deeply nested branches, and reuse existing logic rather than duplicating it.
- Name identifiers for their role; use boolean names such as `isActive` or `shouldRefresh`.
- In index files, prefer `export * from './module'` over named re-exports.
