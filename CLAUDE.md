# @antelopejs/dms-mailing

> AntelopeJS DMS module for mailing: e-mail templates with a block editor, a send log and delivery metrics.

See [AGENTS.md](./AGENTS.md) for code conventions and guidelines.

## Shape

The repository is a pnpm workspace: the root holds tooling only, the two
published packages live under `packages/`.

- `packages/dms-mailing/src/` — the whole server side. Pages are declared with DMS factories (`TableView`, `KpiCard`, `ChartCard`, `TopListCard`, `PeriodSelector`, `Form`), not custom Vue: `overview`, `templates`, `editor`, `sends`, plus a `settings` page in the settings area.
- `packages/dms-mailing/src/engine/` — pure TS, no runtime dependency: a block tree resolves to an e-mail (token interpolation, conditions, list expansion) and can render itself to standalone HTML when the front end is unreachable.
- `packages/interface-dms-mailing/` — the separately published public interface other modules consume: `SendTemplate` and `RecordEmailEvent`.
- `packages/dms-mailing/frontend-vue/` — only what the DMS cannot express: the templates gallery (a TableView display), the detail drawers, the block editor, and `app/emails/EmailMailingTemplate.vue`. `dms.frontend.ts` registers Vue components and plugins; `dms.email.ts` exposes server-only templates that share the DMS email branding.

## Testing

The test scripts all live in `packages/dms-mailing`; the root forwards only
`build`, `lint`, `typecheck`, `knip` and `test` to it.

- `pnpm --dir packages/dms-mailing test` runs both suites: `test:backend`
  (`ajs module test`, unit + integration against a Mongo memory server and an
  SMTP fixture) then `test:layer` (vitest over the Vue layer). Both run on
  their own too, and `test:unit` / `test:integration` narrow the backend run to
  one folder.
