# @antelopejs/dms-mailing

> AntelopeJS DMS module for mailing: e-mail templates with a block editor, a send log and delivery metrics.

See [AGENTS.md](./AGENTS.md) for code conventions and guidelines.

## Shape

The repository is a pnpm workspace: the root holds tooling only, the two
published packages live under `packages/`.

- `packages/dms-mailing/src/` — the whole server side. Pages are declared with DMS factories (`TableView`, `KpiCard`, `ChartCard`, `TopListCard`, `Section`, `Form` with sections), custom Vue only where the DMS has no block: `overview`, `templates`, the editor (`templates/:id`), `sends` and `settings`, all in the module sidebar. Every `CustomComponent` and the settings form carry a `.meta()` with `$dms_mailing.permissions.*` keys. Templates keep a draft (`json_draft`) next to the published content (`json_content`); publishing writes a row in `mailing_template_versions`.
- `packages/dms-mailing/src/engine/` — pure TS, no runtime dependency: a block tree resolves to an e-mail (token interpolation, conditions, list expansion) and can render itself to standalone HTML when the front end is unreachable.
- `packages/interface-dms-mailing/` — the separately published public interface other modules consume: `SendTemplate` and `RecordEmailEvent`.
- `packages/dms-mailing/frontend-vue/` — only what the DMS cannot express: the templates gallery (a TableView display), the drawers and dialogs, the block editor, the overview and settings blocks, and `app/emails/EmailMailingTemplate.vue`. `dms.frontend.ts` registers every component under the `Mailing` prefix (`MailingEditor`, `MailingBlockHero`…) and the plugins; the module's composables and utils are imported by path. `dms.email.ts` exposes server-only templates that share the DMS email branding.
- `docs/design-v2-grill-me.md` — the decision log of the v2 redesign.

## Testing

The test scripts all live in `packages/dms-mailing`; the root forwards only
`build`, `lint`, `typecheck`, `knip` and `test` to it.

- `pnpm --dir packages/dms-mailing test` runs both suites: `test:backend`
  (`ajs module test`, unit + integration against a Mongo memory server and an
  SMTP fixture) then `test:layer` (vitest over the Vue layer). Both run on
  their own too, and `test:unit` / `test:integration` narrow the backend run to
  one folder.
