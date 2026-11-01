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

```ts fragment
// antelope.config.ts
nodemailer: {
  source: { type: "package", package: "@antelopejs/nodemailer", version: ">=0.0.5 <1.0.0" },
  config: { ethereal: true },
},
```

Restart the backend, then the frontend, and open **Modules › Mailing** (`/modules/mailing/overview`). Create a template from a starter such as **Order confirmation**, publish it, then send it from any module through [`@antelopejs/interface-dms-mailing`](https://github.com/AntelopeJS/dms-mailing/tree/main/packages/interface-dms-mailing):

```ts fragment
import { SendTemplate } from "@antelopejs/interface-dms-mailing";

await SendTemplate("order-confirmation", {
  tenantId,
  to: "sofie@example.com",
  variables: { order: { total: "48.00" } },
});
```

## Compatibility

<!-- antelopejs-docs-compat:start -->

| Package                                     | Supported                                                                       | Tested with |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ----------- |
| `@antelopejs/interface-api`                 | `file:../../.campaign/tgz/antelopejs-interface-api-f2a99b5.tgz`                 | —           |
| `@antelopejs/interface-api-util`            | `file:../../.campaign/tgz/antelopejs-interface-api-util-cc740f8.tgz`            | —           |
| `@antelopejs/interface-core`                | `>=0.2.4 <1.0.0`                                                                | —           |
| `@antelopejs/interface-data-api`            | `file:../../.campaign/tgz/antelopejs-interface-data-api-26c36e9.tgz`            | —           |
| `@antelopejs/interface-database`            | `file:../../.campaign/tgz/antelopejs-interface-database-02e0360.tgz`            | —           |
| `@antelopejs/interface-database-decorators` | `file:../../.campaign/tgz/antelopejs-interface-database-decorators-e79a62b.tgz` | —           |
| `@antelopejs/interface-dms`                 | `file:../../.campaign/tgz/antelopejs-interface-dms-e0787e6.tgz`                 | —           |
| `@antelopejs/interface-dms-automation`      | `file:../../.campaign/tgz/antelopejs-interface-dms-automation-b4bc5d2.tgz`      | —           |
| `@antelopejs/interface-dms-mailing`         | `>=0.9.0 <0.10.0`                                                               | —           |
| `@antelopejs/interface-email`               | `>=0.0.6 <1.0.0`                                                                | —           |

<!-- antelopejs-docs-compat:end -->

The module also needs a DMS backend in a release that implements the `@antelopejs/interface-dms` range in the table above, and the `@antelopejs/dms-frontend` renderer in the range its frontend module declares in `engines["@antelopejs/dms-frontend"]` of `frontend-vue/package.json`; the `ajs dms` CLI refuses to build it with a renderer outside that range.

- Database module: one that enforces unique indexes, such as `@antelopejs/mongodb` or `@antelopejs/postgres`.
- E-mail provider: an `@antelopejs/interface-email` implementation, such as `@antelopejs/nodemailer`.

## Slugs

Sends find a template by its slug, so a slug belongs to one template per
workspace: the `slug` index of `mailing_templates` is unique. Creating or
duplicating a template with a slug another template holds, even in a race,
gets `409 duplicate_slug` instead of a second template. Deleting a template
frees its slug. This needs a database module that enforces unique indexes
(such as `@antelopejs/mongodb` or `@antelopejs/postgres`); RethinkDB refuses
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
