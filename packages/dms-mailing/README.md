<div align="center">

# @antelopejs/dms-mailing

<a href="https://www.npmjs.com/package/@antelopejs/dms-mailing"><img alt="npm" src="https://img.shields.io/npm/v/@antelopejs/dms-mailing?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@antelopejs/dms-mailing?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000"></a>
<a href="https://dms.antelopejs.com/docs/modules/mailing"><img alt="Documentation" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000"></a>

E-mail templates, sends and delivery metrics for the AntelopeJS DMS.

</div>

![The Mailing overview: reach, engagement and list health for the last 30 days](https://raw.githubusercontent.com/AntelopeJS/dms-mailing/main/packages/dms-mailing/docs/images/overview.png)

## What it does

- Designs e-mail templates in a block editor, with typed variables, conditions, lists and live test data.
- Keeps edits in draft and publishes them as versions, in several locales.
- Sends a template by its slug from your code, an automation or the dashboard, through any `@antelopejs/interface-email` provider.
- Logs every send with the provider's timeline, and turns delivery, open and click events into an overview.
- Protects your sender reputation with a suppression list fed by bounces, complaints and unsubscriptions.

## Install

Run the AntelopeJS CLI from the root of a project that already loads `@antelopejs/dms`, and add an e-mail provider if the project has none:

```bash
ajs project modules add @antelopejs/dms-mailing
ajs project modules add @antelopejs/nodemailer
```

## Quick start

In development, send to a throwaway Ethereal inbox:

```ts
// antelope.config.ts
nodemailer: {
  source: { type: "package", package: "@antelopejs/nodemailer", version: ">=0.0.5 <1.0.0" },
  config: { ethereal: true },
},
```

Restart the backend, then the frontend, and open **Modules › Mailing** (`/modules/mailing/overview`). Create a template from a starter such as **Order confirmation**, publish it, then send it from any module through [`@antelopejs/interface-dms-mailing`](https://github.com/AntelopeJS/dms-mailing/tree/main/packages/interface-dms-mailing):

```ts
import { SendTemplate } from "@antelopejs/interface-dms-mailing";

await SendTemplate("order-confirmation", {
  tenantId,
  to: "sofie@example.com",
  variables: { order: { total: "48.00" } },
});
```

## Compatibility

| Package | Version |
| --- | --- |
| `@antelopejs/dms` | `>=0.11.0 <1.0.0` |
| `@antelopejs/interface-dms` | `>=0.9.0 <1.0.0` |
| `@antelopejs/dms-frontend` (renderer, playground range) | `>=0.9.0 <0.10.0` |
| `@antelopejs/interface-dms-mailing` | `>=0.9.0 <0.10.0` |
| Database module | one that enforces unique indexes: `@antelopejs/mongodb` `>=1.5.0`, `@antelopejs/postgres` `>=0.2.2` |
| E-mail provider | an `@antelopejs/interface-email` implementation, such as `@antelopejs/nodemailer` |

On DMS 0.8, use `@antelopejs/dms-mailing` 0.4.

## Slugs

Sends find a template by its slug, so a slug belongs to one template per
workspace: the `slug` index of `mailing_templates` is unique. Creating or
duplicating a template with a slug another template holds, even in a race,
gets `409 duplicate_slug` instead of a second template. Deleting a template
frees its slug. This needs a database module that enforces unique indexes
(`@antelopejs/mongodb` 1.5, `@antelopejs/postgres` 0.3); RethinkDB refuses
the schema.

## Documentation

- [Introduction](https://dms.antelopejs.com/docs/modules/mailing/introduction)
- [Installation](https://dms.antelopejs.com/docs/modules/mailing/installation)
- [Configuration](https://dms.antelopejs.com/docs/modules/mailing/configuration)
- [Usage](https://dms.antelopejs.com/docs/modules/mailing/usage/overview)
- [Extending](https://dms.antelopejs.com/docs/modules/mailing/extending): sending from code, provider events and webhooks, automations
- [FAQ](https://dms.antelopejs.com/docs/modules/mailing/faq)

The guide's sources live in [`packages/dms-mailing/docs`](https://github.com/AntelopeJS/dms-mailing/tree/main/packages/dms-mailing/docs). The module ships the `dms-mailing` Claude Code skill in [`packages/dms-mailing/skills`](https://github.com/AntelopeJS/dms-mailing/tree/main/packages/dms-mailing/skills), declared under `antelopeJs.skills`.

## Contributing

This package lives in the [`AntelopeJS/dms-mailing`](https://github.com/AntelopeJS/dms-mailing) pnpm workspace, next to `@antelopejs/interface-dms-mailing`. Read [CONTRIBUTING.md](https://github.com/AntelopeJS/dms-mailing/blob/main/CONTRIBUTING.md) and the [repository README](https://github.com/AntelopeJS/dms-mailing#contributing) for the development commands.

## License

[Apache-2.0](./LICENSE)
