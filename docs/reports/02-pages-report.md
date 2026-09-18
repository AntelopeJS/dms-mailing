# Phase 2 report — declarative pages & layer glue

Branch `mailing-pages`. All 9 tasks of `02-pages.md` executed in order, TDD, no commits.

## Gates

| Gate | Result |
|---|---|
| `cd nuxt-layer && pnpm test` | 9 files, 12 tests, green |
| `cd nuxt-layer && pnpm lint` (`eslint .`) | clean, 0 errors 0 warnings |
| `pnpm lint` (root: oxlint + oxfmt + layer eslint) | green |
| `pnpm typecheck` | green |
| `pnpm build` | green |
| `pnpm knip` | no unused dependencies (3 pre-existing config hints only) |

## Task Step 0 result (Task 6) — the ActionTarget contract

The plan assumed an `{ type: 'event', name }` row-action target. **It does not exist.**
Full findings and the ready-to-apply row-action declarations are in
[`02-pages-row-actions.md`](./02-pages-row-actions.md). Summary of the two signatures
the plan asked for:

```ts
// 1. the target a custom row action declares (src/interfaces/cms-base/types/action-target.ts)
type ActionTarget =
	| { type: "drawer"; component: Component; title?: string; description?: string }
	| { type: "modal"; size?: ModalSize; component: Component; title?: string; description?: string }
	| { type: "page"; url: string }
	| { type: "external"; url: string; newTab?: boolean }
	| { type: "api"; url: string; method?: HttpMethod; successMessage: string; confirm?: ConfirmOptions }
	| { type: "exportJob"; url: string; /* … */ }

// 2. how the component receives the row (cms-ui/.../useTableViewRowActions.ts, handleComponentTarget)
componentOptions = {
	...target.component.options,
	pageId, componentId, containerId,
	rowData,             // the FULL row
	onSuccessCallback,   // () => { container.close(); refreshCallback?.() }
}
// page/external/api/exportJob instead run interpolateUrl(url, rowData): `{field}` → encoded value
```

Approved by the coordinator: the three `*Actions.vue` event-subscriber components were
dropped; containers, row passing, refresh, toast and confirm are handled by the CMS.

## Delivered

`nuxt-layer/`

- **harness** — `vitest.config.ts`, `tests/*` (9 files), `"test"` script; root `test` / `test:layer`.
- **types** — `app/types/mailing.ts` (block model, resolved e-mail, every API payload),
  `app/types/component.ts` (`MailingComponentProps`, `GalleryDisplayContext`).
- **api** — `app/composables/useMailingApi.ts` (every `/api/mailing` call in one place),
  `app/composables/useMailingPeriodData.ts`, `app/utils/{snippet,period,gallery,timeline,segment-rules}.ts`.
- **i18n** — both locale files rebuilt with the full key set (identical key sets, asserted
  by `tests/i18n.test.ts`); French copy taken from the Claude Design source.
- **components** — `ProviderChip`, `AttentionCard`, `FunnelCard`, `TemplateGallery`,
  `TemplateCard`, `TemplatePreviewFrame`, `TemplateDrawer`, `TestSendModal`, `SendDrawer`,
  `SegmentDrawer`, `SegmentRulesInput`, `HtmlPreviewModal`.
- **plugins** — `template-gallery-display.client.ts` (TableView display `gallery`),
  `segment-rules-data-type.client.ts` (DataType `mailing_segment_rules`).
- **removed** — `app/custom-pages/mailing/overview.vue` and its `components.dirs` entry
  (the directory no longer exists; phase 3 puts the editor under `app/components/`).

## Deviations from `02-pages.md` (all deliberate)

1. **No `*Actions.vue`** — see above, coordinator-approved.
2. **`src/pages/{templates,sends,segments}.ts` not edited** — phase 1 had not landed, so
   those files do not exist on this branch. Their exact row-action blocks are in
   `02-pages-row-actions.md`, ready to apply after the merge.
3. **`useMailingPeriodData`** added (not in the plan): `AttentionCard` and `FunnelCard`
   both need "wait for the period scope, then fetch"; duplicating it would break DRY.
4. **`HtmlPreviewModal.vue`** added (not in the plan): `useModal()` needs a component to
   mount, so the send drawer's "view HTML" iframe needs its own SFC.
5. **`TemplatePreviewFrame` uses `sandbox="allow-same-origin"`, not `sandbox=""`** — a
   fully sandboxed frame is an opaque origin, so `contentDocument.body.scrollHeight`
   (the plan's height source) is unreadable. Scripts stay blocked either way.
6. **Mini-stats omitted from the template drawer** — as the plan itself instructs.
7. **`nuxt-layer` dependencies left untouched.** The plan allowed removing
   `@nuxt/kit`, `@vueuse/core`, `@vueuse/nuxt`, `vue-tsc` "only if still unused":
   `@vueuse/core` is used (`useDebounceFn` in the preview frame), `vue-tsc` backs
   `pnpm typecheck` in the layer, `@nuxt/kit` is what the `acms dev` workspace resolves
   (see the `cms-dev-orca` skill's empty-workspace failure mode), and `@vueuse/nuxt`
   pairs with `@vueuse/core`. `pnpm knip` reports nothing unused.

## Not verified — the `[admin]` steps

Tasks 4, 5, 6, 7, 8 and the Task 9 walkthrough are marked `[admin]`. They need the
phase-1 backend (`/api/mailing/*` routes, the templates/sends/segments pages, the
`PeriodSelector` that registers the `mailing-overview` scope). `feat/mailing-backend`
had not landed (`origin/main` is still at `9a80590`), so **none of the admin steps ran**.
Unit tests for those tasks are green.

Two further caveats found while trying to verify:

- **Parallel worktree frontends collide.** `acms dev` composes every worktree's layers
  into one shared checkout, `/Users/fabrice/cloud/antelope/cms-nuxt/.components_cache/`,
  and binds the same port. Starting this worktree's frontend overwrote the cache the
  `mailing-editor` worktree was serving from (and vice versa). This worktree's servers
  were stopped again to hand the frontend back. Phase 5 QA should run one worktree's
  frontend at a time.
- **`nuxt typecheck` in the layer needs a prepared workspace.** Without
  `generated-layers.json` (which `acms prepare` writes only against a running backend
  with the bootstrap credential) the CMS auto-imports do not resolve, so the layer
  typecheck reports `Cannot find name 'useAuthFetch' | 'usePeriodScope' | 'useDrawer' |
  'useModal' | 'useDataTypes' | 'useUniqueLocales' | 'useCurrentUser' |
  'registerTableViewDisplay'` plus four `implicitly any` callbacks that cascade from
  them. Every other layer type error found this way was fixed. This is not a repo gate
  (root `typecheck` covers `src/**` only).

## Re-check list once phase 1 lands

1. `git merge origin/main`, then apply `02-pages-row-actions.md` to `src/pages/*.ts`.
2. `CMS_WT=active bash ~/.claude/skills/cms-dev-orca/cms-dev-orca.sh restart` + `login`.
3. Overview: attention + funnel cards populated after one test send.
4. Templates: gallery grouped by category, display switch, card previews, details drawer
   (preview, variables, snippet), test send through Ethereal, publish/archive.
5. Sends: provider chip, KPI row, details drawer with timeline, replay.
6. Segments: create with two rules through the native form (custom rules input), recount,
   details drawer with contacts.
