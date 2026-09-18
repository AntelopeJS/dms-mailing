# @antelopejs/interface-dms-mailing

<div align="center">
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="https://antelopejs.com"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

The public AntelopeJS interface of the DMS mailing module
([`@antelopejs/dms-mailing`](https://github.com/AntelopeJS/dms-mailing)). It
carries the two interface functions other modules call, and the block and send
types they exchange.

```ts
import {
  RecordEmailEvent,
  SendTemplate,
} from "@antelopejs/interface-dms-mailing";

// Render a live template and send it.
const result = await SendTemplate("order-confirmation", {
  tenantId,
  to: [{ email: "sofie@example.com", name: "Sofie" }],
  locale: "fr",
  variables: { order: { total: "48.00" } },
  source: "checkout",
});

// Report a provider event against the send it belongs to.
await RecordEmailEvent(tenantId, {
  provider: "brevo",
  messageId,
  type: "bounced",
  details: { reason: "mailbox full" },
});
```

Declaring this package as a dependency is what wires a consumer to whichever
module implements the interface; the implementation lives in
`@antelopejs/dms-mailing` and is documented
[there](https://github.com/AntelopeJS/dms-mailing/tree/main/packages/dms-mailing).

## License

Apache-2.0
