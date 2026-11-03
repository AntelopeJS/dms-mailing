---
covers:
  - packages/dms-mailing/src/crons/attention.ts
  - packages/dms-mailing/frontend-vue/app/utils/period.ts
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
- `kpis-count-the-right-sends`: the six KPIs count real sends only, state exact figures and changes against the previous period.
- `engagement-outlives-the-final-status`: a send opened or clicked and then unsubscribed or reported as spam still counts as opened and clicked.
- `default-period-is-30-days-compared-with-the-previous-period`: without a window the KPIs read the last 30 days, compared by default; periods of 7 and 90 days select their own sends.
- `previous-year-compares-the-same-dates-a-year-earlier`: vs previous year compares with the same dates a year earlier.
- `delivery-figures-show-no-value-when-nothing-reports-deliveries`: deliverability, open rate and click rate show no value until something reports deliveries back.
- `volume-chart-plots-sends-per-day-with-an-aligned-comparison`: the send volume chart plots sends per day, leaves out test and suppressed sends, and draws the compared period aligned day by day.
- `best-opened-templates-rank-up-to-10-with-5-deliveries-or-more`: Best opened templates ranks up to 10 templates by open rate, only rows with 5 or more deliveries, and each row changes against the compared period.
- `open-rate-by-domain-ranks-up-to-6-domains-with-5-deliveries-or-more`: Open rate by domain ranks up to 6 recipient domains with 5 or more deliveries, with a change per row.
- `funnel-counts-sent-to-unsubscribed-by-template-kind`: the funnel counts sent, delivered, opened, clicked and unsubscribed for All, Transactional and Marketing templates, with the change per step.
- `needs-attention-lists-what-to-act-on`: Needs attention lists sends with a problem, missing locales, a missing sender, unreported deliveries, opens and clicks, a test-only period and unused live templates, each with its verb.
- `setup-facts-follow-the-workspace`: the setup checklist reads a connected provider, a sender, a live template and a test send.
- `overview-page-shows-figures-and-follows-period-and-comparison`: the Overview shows the six KPIs in their groups, follows the 7D, 30D and 90D switch and the comparison menu.
- `overview-funnel-rankings-and-attention-cards`: the lower cards: Needs attention with its verbs, the funnel switch and biggest drop, the two rankings with their empty state.
- `overview-empty-ranking-and-setup-checklist`: the rankings state when there are not enough deliveries; a workspace without a live template shows the setup checklist.
- `overview-live-mode-refreshes-figures-and-pause-freezes-them`: in Live mode the figures refresh as e-mails are sent, Pause freezes them and the L key switches the mode.

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
