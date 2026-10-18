<div align="center">

# @antelopejs/interface-dms-mailing

<a href="https://www.npmjs.com/package/@antelopejs/interface-dms-mailing"><img alt="npm" src="https://img.shields.io/npm/v/@antelopejs/interface-dms-mailing?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@antelopejs/interface-dms-mailing?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000"></a>
<a href="https://dms.antelopejs.com/docs/modules/mailing/extending"><img alt="Documentation" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000"></a>

The AntelopeJS interface to send DMS mailing templates and report e-mail events from any module.

</div>

## What it does

- Sends a published template by its slug, to one recipient or many, in a given locale and with its variables (`SendTemplate`).
- Reports a provider event (delivered, opened, clicked, bounced…) against the send it belongs to (`RecordEmailEvent`).
- Ships templates, template categories and the workspace sender as code, published and idempotent, without overwriting what a user changed since (`DeclareTemplate`, `DeclareTemplateCategory`, `DeclareSender`).
- Imports past sends and their events with their own dates, for a demo data set or a move from another provider (`ImportSends`).
- Exports the template and send types (`Block`, `TemplateContent`, `VariableDefinition`, `SendStatus`, `EmailEvent`…) for code that builds or inspects templates.
- Keeps your module independent of the implementation, [`@antelopejs/dms-mailing`](https://www.npmjs.com/package/@antelopejs/dms-mailing).

## Install

Add the interface to the module that sends e-mails:

```bash
pnpm add @antelopejs/interface-dms-mailing
```

## Quick start

```ts
import { RecordEmailEvent, SendTemplate } from "@antelopejs/interface-dms-mailing";

const result = await SendTemplate("order-confirmation", {
  tenantId,
  to: [{ email: "sofie@example.com", name: "Sofie" }],
  locale: "fr",
  variables: { order: { total: "48.00" } },
  source: "checkout",
});

await RecordEmailEvent(tenantId, {
  provider: "brevo",
  messageId,
  type: "bounced",
  details: { reason: "mailbox full" },
});
```

A recipient on the workspace's suppression list gets no e-mail: its result has the status `suppressed`. A template whose footer links to an unsubscribe or a preferences page expects `unsubscribeUrl` / `preferencesUrl` in `variables`.

## Compatibility

Interface 0.8 requires `@antelopejs/dms-mailing >=0.6.0`, whose interface dependency is `>=0.8.0 <0.9.0`. This includes `DeclareTemplate`, `DeclareTemplateCategory` and `ImportSends`, all requiring an explicit `tenantId`. Mailing 0.5 remains on interface 0.7. `DeclareSender` and the `scope` / `replace` options of `ImportSends` need interface 0.9 and the first release implementing it (`>=0.9.0 <0.10.0`). The interface declares these dependencies:

<!-- docs-compat: ./package.json#dependencies -->

| Package | Range |
| --- | --- |
| `@antelopejs/interface-core` | `>=0.2.4 <1.0.0` |
| `@antelopejs/interface-email` | `>=0.0.6 <1.0.0` |

## Documentation

- [Consumer reference](./docs/1.index.md): signatures, results, failures, tenant boundaries and template types
- [Extending the mailing module](https://dms.antelopejs.com/docs/modules/mailing/extending): sending from code, what a recipient receives, provider webhooks, automations
- [Mailing module guide](https://dms.antelopejs.com/docs/modules/mailing)

## Contributing

This package lives in the [`AntelopeJS/dms-mailing`](https://github.com/AntelopeJS/dms-mailing) pnpm workspace, next to the module that implements it. Read [CONTRIBUTING.md](https://github.com/AntelopeJS/dms-mailing/blob/main/CONTRIBUTING.md) and the [repository README](https://github.com/AntelopeJS/dms-mailing#contributing) for the development commands. Release this package before the module that implements it.

## License

[Apache-2.0](./LICENSE)
