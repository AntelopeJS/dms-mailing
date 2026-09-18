# Phase 2b report — row actions, i18n gap, `[admin]` walk

Branch `mailing-pages`, merged from local `main` (`a278229`). Nothing committed.

## Gates

| Gate | Result |
|---|---|
| `pnpm lint` | green |
| `pnpm typecheck` | green |
| `pnpm build` | green |
| `pnpm test` | 39 backend passing · 20 layer files / 38 tests |

## 1. Row actions applied

`docs/plans/mailing-v1/02-pages-row-actions.md` applied to the three pages phase 1
created. Two adaptations were needed against the doc:

- `CustomRowAction` is **not** re-exported from `interfaces/cms-base`; it lives at
  `interfaces/cms-base/types/row-action`. It is also generic over the table API type,
  which does not satisfy its `Record<string, unknown>` constraint — so the
  publish/unpublish helper returns an inferred literal (`type: "api" as const`) rather
  than an annotated `CustomRowAction`.
- `displays` gained `options: { categories: DEFAULT_CATEGORIES }` on the gallery entry,
  which is what feeds the gallery's category grouping.

Everything else went in verbatim: drawer targets on the three drawers, a modal target on
`CmsMailingTestSendModal`, a `page` target for the editor, and `api` targets for
publish / unpublish / archive / replay / recount. The native `details` action is now
`false` on all three pages.

## 2. i18n gap closed

26 static keys the backend emits were missing; all were added to **both** locale files
with real French. (The brief said 27 — the difference is a counting artefact: one of the
listed entries, `errors.`, is a template-literal prefix, not a static key.)

`nuxt-layer/tests/i18n.test.ts` gained a third case that walks `src/**/*.ts`, extracts
every `$cms_mailing.*` literal, drops the ones ending on a dot (prefixes completed by a
`${...}` expression) and asserts the rest resolve to a string in **both** locales. It
fails today if a backend key is added without its translation.

Also removed six now-dead keys — `attention.{bounces,missing_locales,stale_drafts}_{title,description}`.
They came from the 02-pages.md spec; phase 1 shipped `attention.{problem_sends,stale_drafts,unused_live}.{title,description}`
instead, and keeping `stale_drafts_title` next to `stale_drafts.title` is a trap.
Nothing in `src/` or the layer referenced them.

The three live attention titles now carry vue-i18n plural forms, so a single item reads
"1 live template never sent" rather than "1 live templates".

## 3. `[admin]` walk

Frontend was exclusive after the coordinator stopped the two stale worktree stacks.
Cache cleared first. Screens walked against the Claude Design intent.

| Screen | Result |
|---|---|
| Overview | 6 KPI, area chart, attention card, funnel card, 2 top lists — all present and correct **after 2 fixes below** |
| Templates (gallery) | Category groups ("Orders"), card preview iframes rendering real HTML, status badge, locale segmented, hover Edit / Test send / Details |
| Template drawer | Header, locale switch, live preview (600 px scaled), missing-locale banner + "Create the FR version", variables, snippet with the real slug, "Used by" listing the observed sources |
| Test send | Recipient prefilled from the session, sent through nodemailer, toast, modal closes |
| Publish / archive | Unpublish → tabs `Live:0 / Draft:1` and the card shows the Draft badge; publish → back to `Live:1` |
| Sends | Provider chip "nodemailer connected", 5 KPI, period selector, 11 tabs, all columns translated |
| Send drawer (row action) | Opened by the `drawer` target with `rowData`; status summary, timeline, template refs, payload, replay |
| Replay (`api` target) | Confirm dialog with my i18n keys → POST → table refreshed 2 → 3 rows |
| Segments | Row created, drawer via row action, rules rendered read-only, recount → "0 Contacts" |
| Settings | All 7 fields translated |

### Fixed during the walk (all layer-side)

1. **`AttentionCard` / `FunnelCard` rendered raw keys** (`$cms_mailing.funnel.sent`).
   Backend-provided display strings carry the CMS `$` prefix and must go through
   `useTranslation().processI18n`, not `t()`.
2. **`SegmentRulesInput` rendered `$cms_mailing.segments.sources.tenant_users`** — same
   cause, for the source name and every field label.
3. **`SegmentRulesInput` showed no fields at all.** Groups were built as nested arrays;
   Nuxt UI reads groups from structural `type: 'label'` entries in a **flat** list. Only
   the group label was rendering, as a selectable option. Now shows all five fields
   grouped under "Tenant users".
4. **`SegmentDrawer` showed empty rules and a blank contact count.** It treated
   `rowData` as the full row, but `rowData` only carries the *listable* columns — never
   `json_rules`. It now always loads the full row from the get route and uses `rowData`
   only for the first paint. `lastCount` falls back to `0` when the segment has never
   been counted.
5. **Test-send toast showed a raw UUID.** Now titled with the recipient address, with
   the status (or the error) as the description.

### Findings that are not bugs

- **Metrics exclude test sends by design** (`src/routes/metrics.ts:80`, `!send.isTest`).
  So "send a test so the metrics have data" cannot work: Overview KPIs, the funnel and
  both top lists stay at 0 until a *non-test* send exists. Replay preserves `isTest`, so
  it cannot seed them either. Seeding real metrics needs a `SendTemplate` call from
  application code (phase 4 territory), or a fixture.
- **The gallery ⇄ table switch lives in the table options menu**, not as a segmented
  control next to the filters as the design draws it. That placement is CMS-owned
  (`MenuRoot.vue` → `MenuViewMode.vue`), not something the layer can change.

### Not exercised

- **Toggling to the table display.** The switcher is present and populated — the CMS only
  renders its "View mode" entry when `hasDisplaySwitcher` is true, i.e. when ≥ 2 offered
  displays are registered, and both `gallery` and `table` are — but the Radix submenu
  dismissed on every scripted interaction, so I could not click through to the table and
  read the row actions from there. The same `drawer` and `api` targets were exercised
  end-to-end on Sends, which uses the built-in grid, so the mechanism is proven; only the
  Templates-specific declaration is unverified in the UI.
- **Creating a segment through the native form.** Simulated pointer events did not drive
  the Reka `USelect` models (Source stayed unset, so zod rejected the submit), which is a
  limitation of the automation, not evidence about the form. The segment was created
  through the table API instead and every layer-owned surface downstream of it was
  verified.

## Operational notes

- The shared `.components_cache` is **restored from the acms workspace on every frontend
  restart**, silently reverting layer edits made since it started. Editing a component
  then copying just that file into the cache gives clean HMR; copying the whole `app/`
  tree triggers a full Nuxt restart, which loses the edits. Worth knowing for phase 5.
- A stale backend serving an older `dist` is indistinguishable from a missing row action:
  the Segments custom actions appeared only after `pnpm build` + a stack restart, having
  been absent for the same code minutes earlier. Rebuild before concluding a page config
  is wrong.
