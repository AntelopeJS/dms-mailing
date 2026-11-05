# Feature map

One file per feature. `covers:` lists the source globs it owns, `docs:` the pages a verdict judges, `journeys/<feature>.mjs` its journeys, `coverage/<feature>.md` the documented behaviours and `seeded-breaks/<feature>.patch` the break its journeys must catch. `dms-control map` checks that every user-facing file is covered and that every feature has its journeys, its seeded break and existing docs pages.

| Feature | What the user does |
|---|---|
| [access](access.md) | Who reaches the mailing routes and pages, the `mailing.send` permission, the `mailing:sends` realtime topic and the tenant data export contributor. |
| [declarations](declarations.md) | `DeclareTemplate`, `DeclareTemplateCategory`, `DeclareSender` and `ImportSends`: what they write once, what they keep, how they validate, the provisioning hook and the languages of names and labels. |
| [editor](editor.md) | Drafts, published versions, revisions, the history and how the blocks render. |
| [overview](overview.md) | The module's landing page: six KPIs, the send volume chart, Needs attention, the funnel and two rankings, over a 7, 30 or 90 day period compared with the previous period, the previous year or nothing; a setup checklist until a provider is connected and a template is live. |
| [package](package.md) | What a project installs from the registry: the module with its build, dashboard layer and skill, the interface with its contract, and the ranges the compatibility table names. |
| [rendering](rendering.md) | What a recipient receives: the multipart message, the HTML and plain-text parts, the viewport tag, the footer links, the logo rule and the `useHtmlRender` option with its fallback. |
| [send-from-code](send-from-code.md) | `SendTemplate` of `@antelopejs/interface-dms-mailing`: its result and aggregation, the refusals, tests and content overrides, how amounts and dates are written, and what the log shows of the language. |
| [sends-drawer](sends-drawer.md) | The drawer of a send: position, J and K, URL, width, problem, timeline, origin, data, footer, send again. |
| [sends-controls](sends-controls.md) | The controls of the Sends page: the period, the Template and Test sends filters, the live hold and Pause, J and K across pages. |
| [sends](sends.md) | The send log: stat strip, stage tabs, the send drawer, send again, send to another address, the provider banner with Send the failures again, the sidebar badge, and the test and real send routes. |
| [settings](settings.md) | Configure › Settings: the sender, the delivery guards, the provider and webhook (secret, rotation, status, test event), the log retention with its preview, and the template categories. |
| [smoke](smoke.md) | The fixed journey every verdict runs, whatever the diff touches: the introduction's "A first test send". |
| [suppressions](suppressions.md) | The suppression list: which provider events and hand entries put an address on it, what a suppressed address gets from every send path, the Configure › Suppression list page and its two HTTP routes. |
| [templates](templates.md) | The gallery, the New template dialog, the drawer and the lifecycle of a template: slugs, copies, publish, unpublish, archive, restore and delete. |
| [webhook](webhook.md) | The generic provider webhook (`POST /api/mailing/events/<provider>/<tenantId>`), `RecordEmailEvent`, the send status ordering, the retry rules, the refusal reasons, the bell notification threshold and posting through the dashboard URL. |

The smoke journey runs on every verdict.
