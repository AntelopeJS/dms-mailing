---
covers:
  - packages/dms-mailing/src/types/suppressions.ts
  - packages/dms-mailing/frontend-vue/app/utils/suppression.ts
  - packages/dms-mailing/src/services/suppressions.ts
  - packages/dms-mailing/src/services/checked-send.ts
  - packages/dms-mailing/src/routes/suppressions.ts
  - packages/dms-mailing/src/data/suppressions-table.ts
  - packages/dms-mailing/src/pages/suppressions.ts
  - packages/dms-mailing/src/db/models/suppressions.model.ts
  - packages/dms-mailing/src/db/tables/suppressions.table.ts
docs:
  - packages/dms-mailing/docs/4.usage/6.suppression-list.md
---

# Suppressions

The suppression list: which provider events and hand entries put an address on it, what a suppressed address gets from every send path, the Configure › Suppression list page and its two HTTP routes.

## Sub-features

- `a-suppressed-address-gets-no-mail-from-any-send-path`: the containment journey. SendTemplate, the real send, the test send, Send again and Send to another address each log a `suppressed` send and reach no inbox; the editor's own address still gets a test; a reactivated address is reached again.
- `provider-events-put-an-address-on-the-list-only-when-nothing-more-must-reach-it`: 22 event cases (every bounce type, the 4xx and 4.x.x answers, spam, unsubscription, the other events, and the test-send variants) and the first reason kept.
- `an-address-is-added-by-hand-and-lifted-over-http`: POST and DELETE `/api/mailing/suppressions`, the 500 character note, 400, 409 and 404.
- `the-tabs-filter-the-list-by-reason`: the five tabs with their counts and rows, and the search.
- `an-address-is-added-and-reactivated-from-the-page`: the Add an address dialog, Reactivate with its confirmation, See the send.
- `suppressed-sends-have-their-tab-in-sends-and-leave-the-figures`: the Suppressed tab of Sends and the figures.

## How to get to it (user POV)

- Modules › Mailing › Configure › Suppression list (`/modules/mailing/suppressions`); the Suppressed tab of Sends.

## Driving it with dms-control

```bash
dms-control journey "$RUN" suppressions
```

Sends are made through `SendTemplate` and `ImportSends` (fixture `/verify-mailing/call`), events through the real webhook with the workspace secret.

## Gotchas

- The row actions menu exists only on entries that came from a send; entries added by hand have none.
- The Reason cell shows the provider's words (the detail) under the label.
- The automation action path is not driven: the playground loads no automation module.
