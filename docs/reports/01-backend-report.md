# Phase 1 — Backend: completion report

Branch worktree: `mailing-backend`. All 19 tasks of `01-backend.md` executed in order, TDD.
No commits made (per dispatch).

## Gates

| Gate | Result |
|---|---|
| `pnpm lint` | pass (oxlint 0 warnings, oxfmt clean, layer eslint clean) |
| `pnpm typecheck` | pass |
| `pnpm knip` | pass |
| `pnpm build` | pass |
| `pnpm test` | 39 passing (28 unit + 11 integration) |

## Deviations from the plan (CMS is authoritative)

1. **`@AuthTenantMember()` is not a class decorator.** `cms/guards` types it as
   `PropertyDecorator & ParameterDecorator` only. The CMS's own table controllers
   (`interfaces/cms/data-controllers/members.js`) carry **no** class-level auth at all —
   authorization comes from `TableView(controller)` binding the controller to a page
   (`table-view/auth.ts` `authorizeAction`). Both `TemplatesTableAPI`, `SendsTableAPI` and
   `SegmentsTableAPI` therefore have no class guard.
2. **`readonlyBehavior: "afterCreation"` does not exist.** `ReadonlyBehavior` is
   `ReadonlyBehaviorType` (`disabled` / `hidden` / `default`) or a per-mode config
   `{ new?, edit?, view? }`. "Editable on create only" is `{ edit: ReadonlyBehaviorType.disabled }`.
3. **Every column needs an explicit `@Access(...)`.** Without it a column is neither read
   nor written (observed: `slug`, `name`, `category` silently absent from `list` results).
4. **`TableViewRoutes.New` returns `string[]`, not `{ id }`.** The plan's tests read
   `created.data.id`; the tests use `created.data[0]`. The `new` wrapper now *wraps* the base
   route (preserving `withActionCheck("add")`, realtime and field validation) and seeds
   version 1 afterwards, instead of replacing `func` outright as the plan sketched —
   replacing it would have dropped the CMS add-permission check.
   `seedTemplate()` became `initializeTemplate(tenantId, templateId, preset, locale, author)`.
5. **`ImplementInterface` requires every declared proxy to have an implementation at
   `construct()` time.** `SendTemplate` / `RecordEmailEvent` / `ResolveSegment` were stubbed
   from Task 9 and replaced by the real services in Tasks 14 / 16 / 18.
6. **`ImplementInterface` overload.** Awaiting the `import()` promises before the call selects
   the synchronous overload, which oxlint flags as `await-thenable`. The call is
   `ImplementInterface(await import(...), await import(...))` without an outer `await`
   (matches the CMS's own `void ImplementInterface(...)`).
7. **`getBy()` returns `PromiseLike`, not `Promise`.** Model helpers that forward it are `async`.
8. **`RequestContext` has no `query`.** Period / limit params are read from
   `ctx.url.searchParams`. Header access uses `@Parameter(name, "header")`.
9. **`assertValidation(body, schema.parse)` trips oxlint `unbound-method`.** All call sites pass
   `(value) => schema.parse(value)`.
10. **`engine/resolve` reports `missing` for `visibleIf`-hidden blocks.** The plan's own Task 6
    test expects `order.trackUrl` in `missing` while the button carrying it is hidden; the plan's
    sample implementation would have returned `[]`. Blocks are resolved first and the
    visibility check applied after, so the test holds. Consequence:
    `blockOnMissingVariables` also blocks on a variable that only a hidden block references.
11. **`file-storage-local` cannot be dropped from the test harness** — `cms` declares
    `@antelopejs/interface-file-storage` as a hard dependency, the runtime refuses to boot
    without a provider. Kept, with a temp storage dir like `cms-media`.
12. **Extra dependencies the plan did not list**: `@antelopejs/interface-database`,
    `@antelopejs/interface-database-decorators`, `@antelopejs/interface-email`,
    `@antelopejs/interface-data-api`, `@types/semver` (mongodb-memory-server's own types need it),
    plus `"types": ["node", "mocha"]` in `tsconfig.json` (the repo pins `types`, so ambient
    mocha globals were invisible).
13. **`SendTemplateParams` gained `content?: TemplateContent`** (additive, as Task 14 requires) so
    a test send can render an unsaved draft.
14. **Segment source registry moved to `src/segments/registry.ts`.** Keeping it in
    `implementations/cms-mailing` created an import cycle
    (`implementations` → `segments/resolve` → `implementations`), which oxlint rejects.
15. **Segments rules column is `json_rules`** (a real table field), with the `new`/`edit`
    wrappers accepting either `rules` or `json_rules` and always persisting a JSON string.
16. **Metrics exclude `isTest` rows** (as Task 17 mandates). The Task 19 smoke expectation
    "KPI open-rate > 0 after a test-send" therefore cannot hold; aggregation is covered by
    `[unit] services/metrics` and the endpoints by the integration smoke.
17. **The settings integration test restores `fallbackLocale: "en"`** at the end — it otherwise
    leaks `fr` into the suites that assert `content.locales.en`.
18. **Task 11/12 and 14/15 route boundaries shifted slightly**: `GET /templates/:id/content`
    landed in Task 11 and `GET /sends/:id` in Task 14, because the plan's own tests for those
    tasks call them. `test-send` lives in `SendsController` (guarded by `SendsPageController`)
    as Task 15 instructs.

## Public HTTP surface (verified live on the dev backend)

`GET|POST /api/mailing/settings` · TableViews `tables/{templates,sends,segments}/*` ·
`GET templates/:id/content` · `POST templates/:id/{versions,publish,unpublish,archive,variables,test-data,preview,duplicate,test-send}` ·
`GET sends/:id` · `GET sends/:id/html` · `POST sends/:id/replay` ·
`POST events/:provider` (header `x-mailing-webhook-secret`) ·
`GET metrics/kpi/:metric` (`sends, deliverability, open-rate, click-rate, bounces, unsubscribes, queued, latency`; unknown → 404) ·
`GET metrics/{volume,top-templates,domains,funnel,attention}` · `GET provider` ·
`GET segments/sources` · `POST segments/:id/count` · `GET segments/:id/contacts?limit=`

curl smoke on `http://localhost:5011`: template created (seeded `receipt`, version 1) → published →
preview (fallback HTML, `missing` correct) → test-send through Ethereal (`status: sent`, messageId) →
`GET /sends/:id` → webhook `opened` then `clicked` (`recorded: true`, status `clicked`, opens 1, clicks 1,
events `[sent, opened, clicked]`) → webhook without the secret → 403. `GET /provider` →
`{"name":"nodemailer","connected":true,...}`.

## Admin walk-through: blocked by a parallel-worktree collision

`/cms/sitelayout` on our backend lists all five pages (`overview`, `templates`, `sends`,
`segments`, `settings` under the settings category) and the backend log prints
`Module route /modules/mailing/{overview,templates,sends,segments}/... gated owner-only`.
The browser check is not conclusive from this worktree right now:

- three sibling worktrees (`mailing-backend`, `mailing-pages`, `mailing-editor`) run dev servers
  at once; ours fell back to backend `:5011` / frontend `:3000`, and the frontend resolves the
  CMS to `:5010` — the `mailing-editor` worktree's skeleton backend — so the sidebar shows one page;
- the shared `~/cloud/antelope/cms-nuxt/.components_cache/@antelopejs-cms-mailing-nuxt-layer`
  currently holds the `mailing-editor` worktree's layer (its `app/components/blocks/*.vue` load
  in our page). This is the known clobbering documented in the `acms-components-cache-shared`
  memory; clearing it would break the editor agent's running frontend, so it was left alone;
- `nuxt-layer/app/custom-pages/mailing/overview.vue` (the skeleton page) still overrides the
  declarative overview route by design — Task 17 says phase 2 removes it.

## For phase 2: i18n keys the backend now emits

Namespace `$cms_mailing.*`, to add to `nuxt-layer/i18n/locales/mailing-{en-GB,fr-FR}.json`.

- `title`, `description`
- `overview.{title,description}`, `templates.{title,description}`, `sends.{title,description}`,
  `segments.{title,description}`, `settings.{title,description}`
- `templates.cols.{name,slug,category,status,preset,version,updatedAt,updatedBy}`
- `templates.status.{draft,live,archived}`, `templates.preset.{blank,receipt,plain,code,promo}`
- `sends.cols.{recipientEmail,recipientName,templateSlug,status,locale,latencyMs,createdAt,source,isTest,error}`
- `sends.status.{queued,sent,delivered,opened,clicked,bounced,spam,failed,unsubscribed}`, `sends.tabs.problems`
- `segments.cols.{name,slug,status,source,rules,lastCount,lastCountAt}`, `segments.status.{draft,live}`
- `segments.sources.tenant_users`, `segments.fields.{email,name,locale,is_owner,joined_at}`
- `settings.fields.{fallbackLocale,logRetentionDays,blockOnMissingVariables,senderName,senderEmail,replyTo,webhookSecret}`
- `metrics.{sends,deliverability,open_rate,click_rate,bounces,unsubscribes,queued,latency,volume,ranking,domains,domain_sends,previous}`
- `funnel.{sent,delivered,opened,clicked,unsubscribed}`
- `attention.{problem_sends,unused_live,stale_drafts}.{title,description}` (each carries a `count` param)
- `errors.{invalid_body,invalid_content,invalid_settings,duplicate_slug,template_not_found,version_not_found,send_not_found,segment_not_found,unknown_metric,bad_webhook_secret}`
- `errors.{template_not_live,missing_variables}` (thrown by `SendError` through `errors.${code}`)

Front-end components the backend references and phase 2/3 must provide:
`CmsMailingAttentionCard`, `CmsMailingFunnelCard`, `CmsMailingSegmentRulesInput`,
the `gallery` TableView display, and the `EmailMailingTemplate` Vue e-mail (until then
`renderEmailHtml` logs one warning per call and falls back to `engine/fallback-html`).
