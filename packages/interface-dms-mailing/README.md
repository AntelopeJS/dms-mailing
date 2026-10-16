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

| Package | Version |
| --- | --- |
| `@antelopejs/dms-mailing` (implementation) | `>=0.5.0` |
| `@antelopejs/interface-core` | `>=0.1.1 <1.0.0` |
| `@antelopejs/interface-email` | `>=0.0.5 <1.0.0` |

## Documentation

- [Extending the mailing module](https://dms.antelopejs.com/docs/modules/mailing/extending): sending from code, what a recipient receives, provider webhooks, automations
- [Mailing module guide](https://dms.antelopejs.com/docs/modules/mailing)

## Contributing

This package lives in the [`AntelopeJS/dms-mailing`](https://github.com/AntelopeJS/dms-mailing) pnpm workspace, next to the module that implements it. Read [CONTRIBUTING.md](https://github.com/AntelopeJS/dms-mailing/blob/main/CONTRIBUTING.md) and the [repository README](https://github.com/AntelopeJS/dms-mailing#contributing) for the development commands. Release this package before the module that implements it.

## License

[Apache-2.0](./LICENSE)
