---
covers:
  - packages/dms-mailing/src/routes/metrics.ts
  - packages/dms-mailing/src/routes/period.ts
  - packages/dms-mailing/src/services/metrics.ts
  - packages/dms-mailing/src/services/attention.ts
  - packages/dms-mailing/src/pages/overview.ts
  - packages/dms-mailing/src/pages/toolbar.ts
  - packages/dms-mailing/frontend-vue/app/components/FunnelCard.vue
  - packages/dms-mailing/frontend-vue/app/components/OverviewGate.vue
  - packages/dms-mailing/frontend-vue/app/utils/funnel.ts
  - packages/dms-mailing/frontend-vue/app/utils/overview-setup.ts
docs:
  - packages/dms-mailing/docs/4.usage/1.overview.md
---

# Overview

The module's landing page: six KPIs, the send volume chart, Needs attention, the funnel and two rankings, over a 7, 30 or 90 day period compared with the previous period, the previous year or nothing; a setup checklist until a provider is connected and a template is live.

## Sub-features

- KPIs: Sends, Deliverability, Open rate, Click rate, Bounces, Unsubscribes (test sends and suppressed sends left out, unmeasured delivery figures empty).
- Send volume chart with its aligned compared series.
- Needs attention entries.
- Funnel with the All, Transactional and Marketing switch.
- Best opened templates (10) and Open rate by domain (6), 5 deliveries minimum, change per row.
- Toolbar: period, comparison menu, Live and Pause, the L key.
- Setup checklist and Resume the setup.

## How to get to it (user POV)

- Modules › Mailing › Overview (`/modules/mailing/overview`), the module's homepage.
- Toolbar under the header: 7D, 30D, 90D, the comparison menu, Live and Pause.

## Driving it with dms-control

```bash
dms-control journey "$RUN" overview [journey-id ...] --skill "$SKILL"
```

- Data comes from `ImportSends` through `calling(ctx, ..., "import", ...)` with `sentAt` days in the past and provider events (`delivered`, `opened`, `clicked`, `bounced`, `failed`, `spam`, `unsubscribed`); the helpers are in `journeys/parts/ui-kit.mjs` (`ago`, `sendOf`, `importSends`, `declareTemplates`, `windowQuery`, `metric`).
- The API journeys read `/api/mailing/metrics/*` with explicit `from`, `to` and `comparison` query parameters; the UI journeys read the page text on one line and match whole chains such as `SENDS 8 ▲ +100.0% vs 4 DELIVERABILITY 62.5%`.
- A suppressed send is made by `POST /suppressions` then the `send` call to that address.

## Gotchas

- The dashboard's 7D, 30D and 90D cut on local calendar days, so a send aged 6 days is in 7D and one aged 7 days is not; the API journeys use rolling windows instead.
- The playground provider is SMTP: it reports no delivery. Imported events make the figures measured; a window of plain sends is "not measured".
- `VERIFY_MAILING_PROVIDER=down` only makes sends fail (ECONNREFUSED); capabilities still answer, so the "provider not connected" states cannot be reached.
