# @antelopejs/dms-mailing

<div align="center">
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="https://antelopejs.com"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

Mailing module for the AntelopeJS DMS: a template library with a block-based
e-mail editor, drafts and published versions, a send log with delivery
metrics, a suppression list and a provider webhook. Other modules send through
[`@antelopejs/interface-dms-mailing`](../interface-dms-mailing).

![The Mailing overview](./docs/images/overview.png)

**Documentation: [dms.antelopejs.com/docs/modules/mailing](https://dms.antelopejs.com/docs/modules/mailing)**
(sources in [`docs/`](./docs); design decisions in
[`docs/design/design-v2-grill-me.md`](./docs/design/design-v2-grill-me.md)).

## Installation

```bash
ajs project modules add @antelopejs/dms-mailing
```

The module targets `@antelopejs/dms` 0.9, `@antelopejs/interface-dms` 0.7 and
`@antelopejs/dms-frontend` 0.6, and needs a module implementing
`@antelopejs/interface-email`. See
[Installation](https://dms.antelopejs.com/docs/modules/mailing/installation)
and [Configuration](https://dms.antelopejs.com/docs/modules/mailing/configuration).

```ts
import { SendTemplate } from "@antelopejs/interface-dms-mailing";

await SendTemplate("order-confirmation", {
  tenantId,
  to: "sofie@example.com",
  variables: { order: { total: "48.00" } },
});
```

## Claude Code skill

The package ships the `dms-mailing` skill in [`skills/`](./skills), declared
in `package.json` under `antelopeJs.skills`.

## Layout

| Path | What it holds |
| --- | --- |
| `src/index.ts` | Module lifecycle (`construct`/`start`/`stop`/`destroy`); registers the Vue frontend module, the automation nodes, the tenant-export contributor, the realtime topics and the crons. |
| `src/pages/` | The DMS pages: `overview`, `templates`, the editor (`templates/:id`), `sends`, `settings` and `suppressions`, all inside the module sidebar. Every custom block carries a `.meta()` with i18n keys. |
| `src/data/` | The `TableView` data controllers behind `/api/mailing/tables/*`. |
| `src/routes/` | The HTTP API under `/api/mailing` (templates, sends, events, metrics, settings, provider, suppressions). |
| `src/engine/` | The pure-TS rendering engine: block tree + variables → resolved e-mail. |
| `../interface-dms-mailing/` | The separately published public AntelopeJS interface (see below). |
| `src/automation/` | The `dms-automation` action and trigger. |
| `src/crons/` | The daily, replay-safe send-log retention job and the hourly refresh of the templates needing attention. |
| `src/hooks/` | The tenant data export contributor. |
| `docs/` | The user guide published on the DMS site, its images, and the design notes (`docs/design/`). |
| `skills/` | The `dms-mailing` Claude Code skill. |
| `frontend-vue/` | Vue module registered under the `Mailing` component prefix: gallery display, template and send drawers, test / real send dialogs, the three-pane block editor, the overview and settings blocks, `dms.email.ts` server template entry and the `mailing-*.json` i18n catalogs. Its own composables and utils are imported by path, not auto-imported. |
| `playground/` | Standalone AntelopeJS project wiring this module to the DMS, Mongo, the API server and the mailer, for local development. |

## Development

```sh
pnpm install
pnpm --dir frontend-vue install
pnpm --dir playground install

pnpm dev            # backend + module, watching src/
pnpm frontend:dev   # the DMS front-end, in another terminal
```

The backend listens on `http://localhost:5010` and needs a MongoDB on
`mongodb://localhost:27017` (database `playground_dms_mailing`); set
`MONGO_URL` to point the playground at another instance. E-mails go to an
Ethereal account, or to a local SMTP server when `SMTP_PORT` is set.

Both packages are public on npm, published under the `@antelopejs` scope with
npm trusted publishing and provenance. The interface package must be released
before `@antelopejs/dms-mailing`. Each package has its own manual workflow:
`Release DMS mailing interface` publishes `../interface-dms-mailing`, `Release
DMS mailing module` publishes this package and refuses to run until the
interface version its dependency range is floored at resolves on npm. Inside
the workspace that same range resolves to the sibling package, through
`link-workspace-packages`. The module implements the interface, so that range
is capped below the next minor (`>=0.7.0 <0.8.0`): a breaking interface minor
never reaches a module that does not implement it, and the release workflow
refuses any other shape.

## Conventions

Every backend-declared text uses the `$key` convention: a string starting with
`$` is resolved against the i18n catalogs by the front-end. Add keys to
`frontend-vue/i18n/locales/mailing-en-GB.json` and its French counterpart.

Every read goes through the DMS's `useApiData`: what a page renders is read by
the server render and handed to the browser; what a drawer, a dialog, a preview
frame or the editor shows is read when it opens or asks (`immediate: false`,
`useMailingReads`). Writes stay on `useMailingApi`.

## Checks

```sh
pnpm lint        # oxlint + oxfmt + the layer's eslint
pnpm typecheck   # tsc --noEmit on tsconfig.json
pnpm knip        # unused dependencies
pnpm build       # tsconfig.json -> dist/
pnpm test        # backend (mocha through `ajs module test`) + layer (vitest)
```
