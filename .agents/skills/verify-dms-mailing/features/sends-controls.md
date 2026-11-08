---
covers:
  - packages/dms-mailing/src/pages/sends.ts
  - packages/dms-mailing/src/pages/toolbar.ts
  - packages/dms-mailing/src/routes/period.ts
  - packages/dms-mailing/src/pages/overview.ts
  - packages/dms-mailing/frontend-vue/app/components/ProviderPill.vue
docs:
  - packages/dms-mailing/docs/4.usage/4.sends.md
---

# Sends controls

The controls of the Sends page: the period (24H by default, 7D, 30D), the Template and Test sends filters, the live hold behind the "N new sends" strip with Pause, and J and K across the pages of the log.

## Sub-features

- `the-sends-period-is-24h-by-default-and-offers-exactly-24h-7d-and-30d`: the period options and the sends each period counts.
- `the-template-and-test-sends-filters-narrow-the-log`: the Template and Test sends filters, alone and together.
- `a-search-and-pause-hold-the-rows-behind-a-new-sends-strip`: a search or Pause holds the rows, Show adds the waiting sends, and the Overview shares Pause.
- `in-live-mode-a-new-send-waits-behind-a-pill-while-the-log-is-on-screen`: with nothing open, scrolled or searched, a new send waits behind a "1 new send" pill that names no reason while the log is on screen, and Show adds it.
- `j-and-k-step-across-the-pages-of-the-log`: with 51 sends, J on the 50th opens the 51st.

## How to get to it (user POV)

- Modules › Mailing › Sends.

## Driving it with dms-control

```bash
dms-control journey "$RUN" sends-controls
```

## Gotchas

- 7D and 30D are calendar periods of the reader (from midnight 6 or 29 days ago to the end of today); 24H is the last 24 hours up to now.
