# Phase 8 report — UX pass from the second visual review

Branch `mailing-pages`, on top of `877f20b`. Nothing committed.

## Gates

`set -o pipefail; pnpm lint && pnpm typecheck && pnpm knip && pnpm build && pnpm test` → exit 0.
84 backend tests (was 80), 21 layer files / 46 tests (was 44).

## One line per item

1. **Versions gone, data included.** `mailing_template_versions`, its model and every
   read/write are deleted. The content lives on `mailing_templates.json_content`,
   replaced in place. `currentVersion` and `templateVersion` are gone from both tables
   and both TableView APIs; `POST /templates/:id/versions` is now
   `POST /templates/:id/content`; `duplicate` copies `json_content` directly;
   `initializeTemplate` and `appendVersion` collapsed into one writer, `saveContent`,
   which also keeps the `locales` column in step. No `vN` anywhere in the UI — the save
   button reads "Save", the card footer, the drawer header, the draft bar and the send
   drawer all dropped it. `GET /sends/:id/html` re-renders from the template as it
   stands today and answers 404 with `$cms_mailing.errors.template_not_found` when the
   template is gone.
2. **Four-field creation that lands in the editor.** The read-only columns carry
   `readonlyBehavior: { new: hidden }`, so the native create form is name/slug/category/
   preset. **The TableView cannot redirect**: `redirectOnSuccess` exists on `FormProps`,
   but `TableViewOptions` has no way to reach the form it builds internally
   (`formComponents` is output-only, on the *Serialized* interface). So creation is a
   custom `CmsMailingNewTemplateModal` behind a `customButtons` entry gated on the
   table's `add` permission, and the native `add` action is off. The modal slugifies the
   name as you type and navigates with `editorRoute` on success.
3. **Code sections removed.** "Call from code" and "Used by" are gone from
   `TemplateDrawer.vue`, with `buildSendSnippet`, its test, the `listSends` facade call,
   `SendListResponse` and the three i18n keys. `app/utils/snippet.ts` survives with only
   `buildResolveSegmentSnippet`, which the *segment* drawer still uses — deleting the
   whole file broke it, so it kept the one function that is still called. Knip green.
4. **Variables derived from the content.** `collectContentVariablePaths` unions
   `collectVariablePaths` across locales; `GET /templates/:id/content` returns
   `detectedVariables`, and `POST /templates/:id/content` returns the refreshed list so
   the editor updates on save. A new pure `mergeVariables(detected, declared)` produces
   one list — declared enriches detected, an unused declaration is marked and sorted
   last, an undeclared path gets a neutral `string`. Both the drawer and the editor rail
   render it; the manual form pre-fills from the undeclared paths through a `datalist`.
5. **Editable name.** The toolbar heading is a borderless `UInput`; typing marks the
   editor dirty, and Save writes the name through the table's `edit` route before
   writing the content. The slug stays read-only.
6. **One control for the test data.** The Data tab owns a single "Use this data set"
   button that stores the set *and* switches the preview into data mode. The toolbar
   toggle is now a badge reading "Preview: variables" / "Preview: test data", with an ×
   that goes back to variables. Nothing else turns data mode on. `{}` parses to an empty
   object, so the preview still renders and shows the tokens.
7. **A real send.** `POST /templates/:id/send` with `realSendSchema` — deliberately **no
   `content` override**, unlike test-send: a real send always uses what is saved. It
   calls the send path with `isTest: false` and `source: "cms-mailing:manual"`;
   `prepareSend` already refuses a non-live template, so a draft returns 422
   `template_not_live`. In the UI it is a distinct "Send" row action and a drawer button
   (live templates only), opening the same modal in `real` mode with a red banner and a
   "I understand this is a real send" checkbox that gates the submit.
8. **Send drawer rebuilt.** Three compact header values (status, latency, locale) in a
   divided box instead of the `CmsStatusSummary` banner; a hand-rolled timeline with one
   row per event — tinted icon bubble, title, grey sub-line, right-aligned time, and the
   connecting line between rows, error rows in `text-error`; a Template block whose two
   rows (template, source) carry a trailing open icon; a compact payload with the copy
   button. `buildTimeline` feeds it directly, including its `tone`, which is now mapped
   once in `TONE_CLASSES`. Replay and view-HTML kept.

## What the CMS made me do differently

- **Creation could not reuse the native form** (item 2 above). A custom modal duplicates
  four fields; the alternative was reaching into undocumented TableView internals.
- **The send permission is declared but enforced nowhere.**
  `MAILING_SEND_PERMISSION` exists in `src/permissions.ts` and is referenced by nothing:
  test-send, replay and now the real send are all gated only by the controller-level
  `AuthUserWithPermission(SendsPageController)`. I guarded the real send "like
  test-send", as the plan says. Enforcing the finer permission needs
  `GetEffectiveUserPermissions(user, tenantId, roleIds, roleModel)` — a `RoleModel` this
  module does not hold — so bolting it onto one route would have been a half-measure. It
  deserves its own pass across all three send paths.

## A defect I introduced and fixed, and one you must decide on

Dropping the versions table **orphaned the content of every template created before this
phase**: it lived in `mailing_template_versions`, and `json_content` is blank on those
rows. Two consequences:

- **Fixed:** `content.locales[locale]` was read unguarded in three places, so a send,
  preview or HTML re-render on such a template answered **HTTP 500 with a stack**. There
  is now one `localeContentOf` accessor and all three callers answer 422
  `$cms_mailing.errors.invalid_content` instead. Verified live against `smoke-order`.
- **Your call:** the three fixture templates in the dev tenant (`smoke-order`,
  `qa-final`, `locale-badges`) have no content and cannot be sent or previewed. A
  migration would mean resurrecting the deleted table to read it once — the "vestigial
  version field just in case" you explicitly refused. I did not write one. Recreating
  the three fixtures is a minute's work; say the word if you would rather have the
  one-shot script.

## How this was verified

Browser popovers (row-action menus, the custom-button modal, the view-mode submenu) did
not respond to scripted clicks in this session — including menus that pre-date my
changes — so the interactive paths were verified through the API instead, as the task
directed. Against the running backend:

| Check | Result |
|---|---|
| `tables/templates/list` | no `currentVersion`; `locales` present |
| `templates/:id/content` | no `version` key; `detectedVariables` = the six paths the receipt preset uses |
| real send on a draft | `422 $cms_mailing.errors.template_not_live` |
| publish then real send | `200`, sent through Ethereal |
| `metrics/kpi/sends?audience=business` | **1** — the real send; the Overview can populate at last |
| `metrics/kpi/sends?audience=operational` | 10 (9 tests + 1 real) |
| legacy empty-content template | `422 invalid_content`, no stack |

Rendered output was read from the DOM: the templates table headers are
`Template · Slug · Category · Status · Updated · Locales · Updated by` — no Version; the
toolbar button reads "New template"; the sends table shows
`real@example.test · phase8-real · Sent · cms-mailing:manual · Test: No` and has no
version column.

**Not visually confirmed:** the create modal, the send drawer's new density and the
real-send confirm step — all three open through the click paths that would not respond.
Their markup and wiring are in place and the routes behind them are proven; they need a
human pass, or a session where the overlays cooperate.

**cms#365 as advertised:** every period-scoped card (the five Sends KPIs, the Overview
KPIs, the attention card) renders its label with no value until a preset is clicked, and
in this session clicking one did not rescue them either. Not investigated further, per
the task.
