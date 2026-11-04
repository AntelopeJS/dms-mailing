<div align="center">

# `@antelopejs/interface-dms-mailing`

<a href="https://www.npmjs.com/package/@antelopejs/interface-dms-mailing"><img alt="npm" src="https://img.shields.io/npm/v/@antelopejs/interface-dms-mailing?style=for-the-badge&labelColor=000000&color=000000" data-illustration></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@antelopejs/interface-dms-mailing?style=for-the-badge&labelColor=000000&color=000000" data-illustration></a>
<a href="https://discord.gg/g4pFt6eXqu"><img alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" data-illustration></a>
<a href="https://dms.antelopejs.com/docs/modules/mailing/extending"><img alt="Documentation" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" data-illustration></a>

The AntelopeJS interface to send DMS mailing templates and report e-mail events from any module.

</div>

## What it does

- Sends a published template by its slug, to one recipient or many, in a given locale and with its variables (`SendTemplate`).
- Reports a provider event (delivered, opened, clicked, bounced…) against the send it belongs to (`RecordEmailEvent`).
- Ships templates and template categories as code when a workspace is provisioned (`DeclareTemplate`, `DeclareTemplateCategory`). A declaration writes once: a template is created already published, and a slug or category id the workspace already has is left as it is.
- Writes the workspace sender when a workspace is provisioned (`DeclareSender`).
- Imports past sends and their events with their own dates, for a demo data set or a move from another provider (`ImportSends`).
- Exports the template and send types (`Block`, `TemplateContent`, `VariableDefinition`, `SendStatus`, `EmailEvent`…) for code that builds or inspects templates.
- Keeps your module independent of the implementation, [`@antelopejs/dms-mailing`](https://www.npmjs.com/package/@antelopejs/dms-mailing).

## Install

Add the interface to the module that sends e-mails:

```bash
pnpm add @antelopejs/interface-dms-mailing
```

## Quick start

```ts fragment
import { RecordEmailEvent, SendTemplate } from "@antelopejs/interface-dms-mailing";

const result = await SendTemplate("order-confirmed", {
  tenantId,
  to: [{ email: "sofie@example.com", name: "Sofie" }],
  locale: "fr",
  variables: {
    customer: { firstName: "Sofie" },
    order: {
      number: "#10482",
      total: { value: 4800, currency: "EUR" },
      lines: [{ name: "Linen shirt", total: { value: 4800, currency: "EUR" } }],
      url: "https://example.com/orders/10482",
    },
  },
  source: "checkout",
});

await RecordEmailEvent(tenantId, {
  provider: "brevo",
  messageId,
  type: "bounced",
  details: { reason: "mailbox full" },
});
```

A recipient on the workspace's suppression list gets no e-mail, and its result has the status `suppressed`. A template whose footer links to an unsubscribe page or a preferences page reads their URLs from `unsubscribeUrl` and `preferencesUrl` in `variables`.

## Compatibility

A `@antelopejs/dms-mailing` release implements one minor line of this interface. The `@antelopejs/interface-dms-mailing` row of the compatibility block in the [module README](../dms-mailing/README.md#compatibility) gives that range. Use a module release whose range covers the interface release your code imports. `DeclareTemplate`, `DeclareTemplateCategory`, `DeclareSender` and `ImportSends` each take an explicit `tenantId`. The interface declares these dependencies:

<!-- antelopejs-docs-compat:start -->

| Package                       | Supported        | Tested with |
| ----------------------------- | ---------------- | ----------- |
| `@antelopejs/interface-core`  | `>=0.4.0 <1.0.0` | `0.4.0`     |
| `@antelopejs/interface-email` | `>=0.0.6 <1.0.0` | `0.0.6`     |

<!-- antelopejs-docs-compat:end -->

## Documentation

- [Consumer reference](./docs/1.index.md): signatures, results, failures, tenant boundaries and template types
- [Extending the mailing module](https://dms.antelopejs.com/docs/modules/mailing/extending): sending from code, what a recipient receives, provider webhooks, automations
- [Mailing module guide](https://dms.antelopejs.com/docs/modules/mailing)

## Contributing

This package lives in the [`AntelopeJS/dms-mailing`](https://github.com/AntelopeJS/dms-mailing) pnpm workspace, next to the module that implements it. Read [CONTRIBUTING.md](https://github.com/AntelopeJS/dms-mailing/blob/main/CONTRIBUTING.md) and the [repository README](https://github.com/AntelopeJS/dms-mailing#contributing) for the development commands. Release this package before the module that implements it.

## License

[Apache-2.0](./LICENSE)
