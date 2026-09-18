# Phase 6 — "the editor page never hydrates": findings

> **Conclusion up front, in three parts.**
>
> 1. **`hidden: true` is not the cause, and nothing in `cms-mailing` is misusing it** (§1, §2). The
>    restructure to a child route was dropped: it would have fixed nothing.
> 2. The symptom is **not editor-specific** — when it strikes, every page of the app renders its
>    shell and page header with an empty body, including CMS-owned pages (§3).
> 3. There **is** a defect worth filing upstream, but it is a different one from the one originally
>    hypothesised: `layouts/default.vue` and `pages/[...slug].vue` in `cms-nuxt`
>    register the **same `useAsyncData` key with two different handlers** (§3b). That is directly
>    evidenced by the warning Nuxt prints on every page load; the causal link to the empty body is a
>    strong inference, not proven.
>
> The editor is simply where it was noticed first, because its own SSR markup is a
> "Loading the template…" state that looks like a hung fetch.

## 1. `hidden: true` is exonerated

### 1.1 What `hidden` actually does

`cms/dist/implementations/cms/page.js`, `internal.RegisterPage.register`:

```js
pagesBySlug[pageInfo.fullSlug] = pageInfo;
if (!pageInfo.hidden) {
    addToTree(pageInfo);          // ← skipped for hidden pages
    notifyStructureChanged();
}
```

`addToTree` builds `navigationTree`, which is served as `siteLayoutTree` and feeds **only** the
sidebar and the module-landing fallback. Route resolution never touches it:

- `GET /cms/sitelayout` returns `siteLayout.pages` from `annotateRegistryAccess(pagesBySlug, …)` —
  the flat map, which **includes hidden pages**.
- `useSiteLayout.matchRoute()` resolves on `layout.pages[normalizedPath]`, and both consumers —
  `layers/cms-layout/app/pages/[...slug].vue` and `middleware/module-routing.global.ts` — call it
  through `findMatchingRoute` with `includeCategories: false`.

So skipping `addToTree` cannot stop a page from resolving. It only keeps it out of the menu, which
is exactly what `hidden` is for.

### 1.2 Runtime evidence, gathered on merged main with `hidden: true` unchanged

- `GET /cms/sitelayout` lists `/modules/mailing/editor` with `hidden: true`, `hasAccess: true`,
  `layoutUrl: /modules/mailing/editor/pagelayout`.
- `GET /modules/mailing/editor/pagelayout` returns
  `{ layout: { componentName: "cms-default-layout", options: { fullWidth: true } },
     components: { editor: { componentName: "CmsMailingEditor", children: [] } } }`.
- The editor loaded **fully** — toolbar, locale switch, device switch, subject row, the whole block
  canvas — on a cold frontend by direct URL as the very first navigation, and again through a
  client-side navigation from the templates gallery "Edit" button.

### 1.3 The decisive counter-experiment

The original diagnosis rested on "flipping `hidden` to `false` and rebuilding makes it work". That
experiment was confounded: it also rebuilt the module and restarted both dev servers.

Re-run in a state where the editor was stuck **100 % of the time** (6/6 cold loads):

| `src/pages/editor.ts` | rebuilt + restarted | result |
|---|---|---|
| `hidden: true` | yes | STUCK 6/6 |
| `hidden: false` | yes | STUCK 3/3 |

`hidden: false` does **not** fix it. The flag is irrelevant to the symptom.

## 2. Q1 — does the cms-saas hidden-child pattern work?

Yes, and it needed no cms-saas boot to prove: **we already ship that exact shape**. The sends
TableView auto-generates hidden child pages with a `:id` segment, and `GET /cms/sitelayout` lists
them:

```
/modules/mailing/sends/new           hidden=True  hasAccess=True
/modules/mailing/sends/:id/edit      hidden=True  hasAccess=True
/modules/mailing/sends/:id/view      hidden=True  hasAccess=True
```

`http://localhost:3001/modules/mailing/sends/<sendId>/view` loads by direct URL, renders the full
detail form, and stays out of the sidebar (it appears only in the breadcrumb).

So hidden pages work in **both** shapes — a hidden top-level module page like ours, and a hidden
child with `:id` like cms-saas's `platform/workspaces/detail.ts`. The difference between the two is
cosmetic (URL shape, breadcrumb), not functional. **The restructure to
`/modules/mailing/templates/:id/editor` was therefore dropped: it would not have fixed anything.**

## 3. What the failure actually looks like

When it strikes:

- The page is rendered server-side — the visible "Loading the template…" is `Editor.vue`'s own SSR
  markup, not a hung request.
- The client never mounts it: `onMounted` never fires, `performance.getEntriesByType("resource")`
  shows **zero** `/api/mailing` requests, and the `Editor.vue` chunk is never fetched.
- A client-side `router.push` to it updates the URL and the page header (both come from the site
  layout metadata, which is fine) but leaves the **previous page body** on screen.
- No console error, no Vue error, no build error. SSR logs are clean.

Crucially it is **not editor-specific**: once the frontend enters this state, `/modules/mailing/overview`,
`/modules/mailing/templates`, `/modules`, and `/settings` all render only the shell plus the page
header, with `document.body.innerText` collapsing to a few hundred characters. The shell itself stays
hydrated — sidebar links still change the route — but the page body subtree never updates.

It survives: a frontend restart, a backend rebuild, clearing the CMS dev app's `.nuxt` and
`node_modules/.vite` caches, a fresh browser tab, and clearing the `user-preferences` /
`dashboard-sidebar` cookies.

## 3b. The most likely mechanism — a shared `useAsyncData` key in the CMS layer

The warning that fires on **every** page load of this app, both on the server and in the browser, is
not cosmetic:

```
[nuxt] [useAsyncData] Incompatible options detected for "page-layout-/modules/mailing/editor"
  (used at layers/cms-layout/app/pages/[...slug].vue:136)
- different handler
```

Two components register the *same* `useAsyncData` key with *different* handlers:

- `layers/cms-layout/app/layouts/default.vue:20`

  ```ts
  const { data: pageLayout } = await useAsyncData(
    `page-layout-${route.path}`,
    async () => {
      if (!metadata.value) return null
      return await siteLayout.loadPageLayout(metadata.value.layoutUrl)
    },
    { watch: [() => route.path] },
  )
  ```

- `layers/cms-layout/app/pages/[...slug].vue:150`

  ```ts
  const { data: pageLayout } = await useAsyncData(
    `page-layout-${route.path}`,
    () => pagelayoutMetadata.value?.layoutUrl
      ? siteLayout.loadPageLayout(pagelayoutMetadata.value.layoutUrl)
      : Promise.resolve(null),
    { watch: [() => route.path] },
  )
  ```

Nuxt keeps the **first** handler registered for a key and warns about the second. Which one that is
depends on layout-vs-page instantiation order, which is not identical between SSR and client, nor
between a cold load and a client-side navigation. Both handlers can legitimately resolve to `null`
(when their respective metadata ref is not yet populated), and a `null` result is then cached under
that route's key for the rest of the session.

That matches every observed detail: the failure is app-wide (every page goes through this layout),
intermittent and order-dependent, leaves the shell and the page header rendered (they come from
`metadata`, not from the async data), leaves the page **body** empty, keeps the previous body on a
client-side navigation, and produces no error anywhere.

This is a real defect in `cms-nuxt` and is worth reporting upstream — but note it
is **not** the defect that was originally hypothesised, it has nothing to do with `hidden`, and it is
not something this module can fix. Stated honestly: the key collision and the two call sites are
directly evidenced (the warning names them); the causal link to the empty body is a strong inference
from the symptom match, not something proven by patching the CMS layer, which was deliberately not
touched (`.components_cache` is shared with the other worktrees).

## 4. What to suspect first, next time

1. **The shared acms layer cache.** `/Users/fabrice/cloud/antelope/cms-nuxt/.components_cache/` is
   keyed by *layer name*, not by worktree. Every cms-mailing worktree writes
   `@antelopejs-cms-mailing-nuxt-layer` there, and the copy is only resynced when the frontend is
   restarted. With five worktrees on this repo, a frontend can be serving a layer written by a
   different branch. Check `diff -rq nuxt-layer/app <cache>/app` before believing anything.
2. **A stale/duplicated dev frontend.** `get-port` silently falls back (3001 → 3000) when a previous
   instance did not die, so the browser can be talking to a zombie server running older code. Check
   `lsof -nP -iTCP:3000 -iTCP:3001 -sTCP:LISTEN` and `pgrep -f "nuxt.mjs dev"`.
3. Only then look at the module's own code.

Do **not** reach for `hidden` — §1 settles it.

## 5. Unrelated things found while digging (not fixed here)

- **Templates gallery display.** `defaultDisplay: "gallery"` is served correctly and our
  `template-gallery-display.client.ts` plugin does run and register (verified: the registry reads
  `gallery,table,kanban`), yet `TableView` often renders the plain table body. `componentId` is
  absent from the served options, so `getTablePreferenceKey()` builds
  `tables.undefined.<pageId>.viewMode`. The active display is also persisted in the
  `user-preferences` **cookie**, which is why the list "randomly" sticks to one display across
  sessions. Worth a look in the phase-2/CMS scope.
- **Row-action dropdowns** (reka-ui menus) do not open under synthetic pointer or keyboard events,
  which makes the table-display row actions undrivable from automation. The gallery's own buttons
  are drivable.

## 6. Change shipped with this report

`TemplateDrawer.vue` navigated to the editor with a bare, un-awaited `navigateTo()` and left the CMS
drawer open. The drawer is a `:dismissible="false"` modal overlay, so leaving it mounted across a
route change puts an undismissable overlay on top of the editor. It now closes its container first:

```ts
function closeContainer(): void {
  if (props.onSuccessCallback) {   // CMS row-action container: closes it and refreshes the table
    props.onSuccessCallback()
    return
  }
  emit('success')                  // opened through useDrawer() from the gallery: DynamicDrawer closes on `success`
}

async function openEditor(targetLocale?: string): Promise<void> {
  closeContainer()
  await nextTick()
  await navigateTo(editorRoute(templateId.value, targetLocale ?? locale.value))
}
```

The editor target was also duplicated as a bare string literal in `TemplateGallery.vue` and
`TemplateDrawer.vue`; it now goes through `app/utils/editor-route.ts` (`editorRoute()`), covered by
`tests/editor-route.test.ts`.
