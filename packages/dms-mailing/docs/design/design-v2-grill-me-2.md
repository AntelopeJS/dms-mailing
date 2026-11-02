---
title: Mailing on DMS v2, the grill-me session (part 2)
description: Decision log of the Mailing module's v2 redesign, sections 6 to 13. Overview, editor, removed behaviour, DMS follow-ups, playground, tests and review follow-ups.
mode: explanation
---

This is the second half of the decision log. Sections 1 to 5 are in [part 1](./design-v2-grill-me.md).

## 6. Overview

### Q6.1 Which key figures?

Review items ML-10.

**Answer.** Grouped as Reach (sends, deliverability) / Engagement (open rate,
click rate) / List health (bounces, unsubscribes, "lower is better"), each
group a `Section` without card holding two `KpiCard`s. The description says
what the page is for and that tests are left out.

### Q6.2 Chart?

**Answer.** Keep the `ChartCard` + `ChartArea`. The campaign named in the
tooltip ("incl. autumn-sale") is not possible: the chart tooltip takes no
extra content and `rawOptions` cannot carry functions. Recorded as a DMS gap.

### Q6.3 Needs attention?

Review items ML-11.

**Answer.** Keep the custom card, restyled with `DmsListRow`: a tone per item,
a bold count, a verb ("Review problems" opens Sends on the Problems tab), a
counter in the header, "updated HH:MM", and an all-clear state that says what
was checked. A new item counts the templates missing a workspace locale.

### Q6.4 Funnel?

**Answer.** Custom card over `DmsMeter` rows, with an All / Transactional /
Marketing switch (marketing = templates in the `marketing` category) and a
one-line takeaway naming the biggest drop.

### Q6.5 First run?

**Answer.** The dashboard sits inside a `MailingOverviewGate` custom block:
until the workspace has a provider and a template, it renders the setup card
(connect a provider, set the sender, create and test a template) instead of
its children.

### Q6.6 Header?

**Answer.** Provider pill (registered by a small custom block through
`usePageHeaderActions`), the period switch, and "New template" as a header
action.

---

## 7. Editor

### Q7.1 Layout?

Review items ML-05 and ML-07 and ML-18.

**Answer.** Three panes on a full-height record page: left Blocks / Outline /
Variables, centre the canvas (subject and preheader rows, the paper, inline
`+` insert points between blocks), right inspector Block / Test data /
Template. Toolbar: back, name with status and version, locale switch with
missing dots, device switch, a real Variables | Data segmented control, save
state, Test, Publish changes.

### Q7.2 Saving?

**Answer.** Autosave the draft (debounced) and ⌘S to force it. A cyan notice
"Customers still receive vN, published … Your N changes go out only when you
publish" with Discard draft. Publish (⌘↵) opens a review listing the changes
per locale and the failed checks (undeclared variables), then creates vN+1.
Compare with live opens the published and draft previews side by side.

### Q7.3 Variables?

Review items ML-06.

**Answer.** Typing `{{` in a text field opens an autocomplete of the declared
paths with their types; undeclared paths are flagged in the list and in the
Variables tab, with a one-click Declare.

### Q7.4 Shortcuts?

Review items ML-08.

**Answer.** ⌘S save draft, ⌘↵ publish, T test send, / block search, ⌫ delete
block, ⌘D duplicate block, Esc back to Templates. Shown in tooltips and in the
left pane footer.

### Q7.5 Missing locale?

Review items ML-14.

**Answer.** The empty state counts the recipients who got the fallback in the
last 30 days and offers Duplicate from <fallback> or an empty page. The
AI-drafted translation of the mockup is left out: the module has no AI
dependency, and adding one is a product decision, not a redesign detail.

---

## 8. What is removed or changed for users

- The real "Send" item next to "Test send" in the row menu (ML-02).
- "Replay this send" as the main action of every send (ML-03).
- The ten status tabs of the send log (ML-09).
- Mailing settings under workspace Settings (ML-13).
- Saving a live template no longer ships it: edits are drafts until published
  (ML-01). Code calling `SendTemplate` keeps receiving the published content.

## 8b. DMS 0.7 follow-up

- The sends locale column uses the stock `two_line` display: the used locale
  over a warning sub-line "DE asked" when the caller asked for another one.
  The custom `mailing:locale-fallback` cell renderer is gone.
- The send log stat strip is worded on the server as `StatGroup` items with
  composed texts (counts, percentages, relative dates). The front end only
  feeds them to `DmsStatGroup`, because `StatGroup` still has no
  `periodScope`; the day it does, the block becomes a stock `StatGroup`.
- The Sends nav badge is red (`{ count, tone: "error" }`).
- DMS 0.7's stricter permissions change nothing here: module pages stay
  owner-only, and `mailing.send` keeps its dependency on the sends page for
  the day module pages become grantable.

## 8c. DMS 0.7.2 follow-up

DMS 0.7.2 (`interface-dms` 0.5.1, `dms-frontend` 0.5.2) lets four custom blocks go:

- Send log stat strip: a stock `StatGroup` with `periodScope` and
  `realtimeTopic` instead of `MailingSendsStats`.
- Provider banner: `Banner({ fetchUrl: "/sends/banner" })`. The route answers
  the banner (composed title and description, a settings link, a "send the
  failures again" button with its confirmation) or `null`, and the banner
  re-reads it on the sends topic instead of polling. `/sends/health` is gone.
  The description no longer quotes the clock time of the first failure: a
  composed text has no time-only format.
- Send log first run: an `EmptyState` block with its `code` snippet, given as
  the table's `emptyStates.firstRun.component`, instead of `MailingSendsEmpty`.
- Overview "Needs attention": an `ActivityFeed` reading `/metrics/attention`,
  whose items are now feed entries (composed title with a typed count, the
  explanation as meta, the next step's verb as the trailing text). The card
  loses the count pill in its head, the bold figure in the title and the
  "updated at" time: `ActivityFeed` has none of them.

Still custom, and why:

- `mailing:locale-chips`: the workspace locales live in the front end's i18n
  config, so the server cannot word the missing ones as `PillItem`s.
- `MailingFunnelCard`, `MailingOverviewGate`, `MailingPageHeader`: they need
  the larger additions (enriched `TopListCard`, a first-run guard, a
  record-driven page header) that 0.7.2 does not ship.

## 8d. DMS 0.7.8 follow-up

- A send opens in the DMS side panel (`sidePanel` target, `rowClick:
  "single"`): the DMS draws its header, the "Send 3 of 50 shown" position,
  J / K and Esc, and keeps the row in the URL. The drawer's own previous and
  next buttons are gone.
- Later, every detail panel became a DMS drawer, the docked side panel being
  kept for global panels (an assistant): the send opens in a `drawer` on the
  right (`direction: "right"`, `dms#375`) with the side panel's row options
  carried over (title, `positionLabel`, `deepLink: true`, `notFound: {}`), at
  the DMS's default 600 px, which the user resizes and the DMS remembers.
  Once the drawer is resized wide, the timeline and the origin sit side by
  side and the data sent keeps the full width. The template details row
  action opens on the right too, as the gallery opens it.
- The drawer's header names the open send (`rowTitle`: its recipient and the
  template slug) instead of "Details", and the position reads "Send 3 of 1,348":
  the DMS counts the table's whole result now, so "shown" went, and it formats
  the numbers with the locale's separators.
- The send fits the drawer as `dms#375` lays it out: the drawer's body is the
  scroll container and sets the 16 px inset, so the send adds no padding nor
  scroller of its own, and its actions stick to the bottom as a form footer
  does (`FORM_SURFACE_CLASSES.container`). The template / locale / latency
  trio keeps three cells from a 28rem group (a 600 px drawer), the timeline
  wraps a long Message-ID instead of clipping it, the recipient's address
  gives way before the date, and the origin's "source" label sits under the
  source rather than beside it. Everything follows the drawer's width
  (container queries), never the viewport's.
- The actions sit at the bottom of the drawer even when the content is a
  little shorter than it. The DMS drawer body is a flex column
  (`AntelopeJS/dms#375`): the send and the template details grow in it
  (`flex-1`), and their actions sit in the DMS `DmsContainerFooter`, which
  takes the leftover space (`mt-auto`) before it sticks, flush with the edge.
- Template details stay in a drawer: the gallery is the module's own table
  display, and a display can only run the row's default action (open the
  editor), not open another action's side panel.
- The period selectors keep their period in the URL by themselves; the module
  had no code of its own for it. No cell is coloured by custom code, so the
  column tones change nothing here.

## 9. Out of scope, recorded as DMS gaps

- The inbox preview under the sender fields: a form input only receives its
  own value, and the form's state is private to the DMS (`app/build/`).

- Row tone / rail in TableView (problem rows).
- A tone on nav badges (the red "3").
- Drawer direction for backend drawer targets.
- Extra content in chart tooltips.
- Domain verification state of the sender address ("acme.com verified"): the
  e-mail interface exposes no such capability.

## 10. Playground

`dms-automation` 0.2.7 does not boot on DMS 0.6 (its run log
offers a display id without a module namespace, which 0.6 refuses). It leaves
the playground until a release supports DMS 0.6; the automation nodes stay
an optional dependency of the module and register when the interface is
there.

## 11. How it is tested

- Backend unit tests for every new service (versions, stages, error wording,
  settings patch, overview stats, attention reasons), integration tests for
  publish / discard / version history, draft test send, real send refusal,
  fix-the-address, the partial settings put and the attention tab.
- Layer tests (vitest) for the editor state, shortcuts, autocomplete, slug
  derivation, locale chips, send footer by status.
- An end-to-end pass in the playground (DMS 0.6 + `dms-frontend` 0.5, Mongo,
  Ethereal) driven by Playwright over every page, drawer and dialog, with the
  screenshots attached to the pull request.

## 12. Review follow-up

The review of the v2 commits (October 2026) asked for no glue, no
compatibility shim and nothing the DMS already provides. What changed:

- **Dependencies.** DMS `>=0.7.11 <0.8.0`, `interface-dms` `>=0.5.6`: 0.7.10
  ships `GetApiBaseUrl` and the side panel's not-found state. The shared
  module sources moved under `src/test`, out of the published package.
- **0.3.4 compatibility removed** (breaking, see the README): the
  `/events/<provider>` webhook route and the tenant in the body,
  `POST /settings`, the read-only fields a patch used to accept, categories as
  JSON text, the scan for settings rows without the tenant key, templates
  read as version 1, the send stage backfill, the `notifications.bounce_*`
  texts. A 0.3 database starts from scratch.
- **Webhook URL.** Built on `GetApiBaseUrl()` (the DMS `apiBaseUrl`), never on
  `X-Forwarded-*`: "Send a test event" can no longer be pointed at an
  arbitrary host. The module's `publicApiUrl` option is gone.
- **Removed as dead or unused:** the settings `If-Match` revision, the
  suppressed-latency migration, the `List-Unsubscribe` header (no provider
  emits it until `EmailParams` has headers), defaults on fields every row
  carries, `useMailingPeriodData`, `useMailingOps`, the gallery's filter,
  search and sort copies, the restore answer's unused fields.
- **Marketing.** The `marketing` category carries the campaign rules: the
  settings refuse a list without it (it can be renamed) and its editor row
  has no remove action.
- **Replaced by the DMS:** the delete / edit route wrappers (TableView
  `guards`), the funnel loader (`useChartFetch`), the category removal
  dialog (confirm `fields`), the per-row category errors (server issues under
  `["categories", i, "label"]` shown by a `UFormField` of that name, in place
  of `useControlError` from `app/build`), the KPI response type
  (`KpiCardData`).
- **Needs attention** became a TableView tab (§Q3.6).

Workarounds removed once the DMS fixed their defect (DMS 0.7.15,
`interface-dms` 0.5.10, `dms-frontend` 0.5.4):

| Workaround | Replaced by |
| --- | --- |
| Webhook URL on the API origin (`GetApiBaseUrl`), not the front's | The module declares `POST /api/mailing/events/*/*` with the `x-mailing-webhook-secret` header in `AddFrontendModule({ publicEndpoints })` (`dms#230`, `dms-frontend#108`): the front proxy lets it through without an `Origin` and without a session. The URL now starts with `GetClientBaseUrl()` (the dashboard's public origin, the one a provider can reach), falling back to `GetApiBaseUrl()`; it is still read from the configuration only, never from request headers, so the server-side "Send a test event" cannot be pointed elsewhere |
| `stripRenderMarkers` (`services/render.ts`) | `GenerateHtml` drops Vue's SSR markers (`dms-frontend#107`) |
| `EmailMailingTemplate.vue` forks `EmailLayout`, `utils/email-logo.ts` | `EmailLayout` without `title`, `:divider="false"`, `logo-alt=""`, `public-logo-only`, the viewport and `<title>` in its `head` slot (`dms#223`); the editor canvas calls the exported `emailLogoUrl` |
| `MailingSuppressionFilter` banner | `queryParamFilters.email` with `visible: true` and a label: a removable chip (`dms#228`) |
| `RetentionInput` re-submits through `requestSubmit()` | `useEnclosingForm()`: `addValidator` holds the save, `submit()` sends it once confirmed (`dms#225`) |
| E11000 caught in `services/notify.ts` | `createIdempotently` treats a reused key as already delivered (`dms#222`); the key is now namespaced `mailing:problems:<slug>:<hour>`, as the DMS docs ask |
| `useControlError` imported from `#dms-ui/app/build/…` | The public, auto-imported composable (`dms#224`) |
| `SendDrawer` keeps the linked send it opened in local state ("See the send") | The panel's `showRow` prop (`dms#252`, DMS 0.7.21): the DMS reads the send from the rows shown or the sends table's `get` route, makes it the open row (highlight, position, `?record=`) and remounts the drawer on it; a send it cannot read shows an error toast |

Kept:

| Workaround | Why |
| --- | --- |
| Hidden searchable "Send id" column | The table search still matches only a field with a column or a filter; finding a send by the id a log or a webhook names (SE-12) needs it. `dms#226` is about `?record=` links, not search |
| `MailingWebhookStatus` as a form field | A form section only holds fields, no display block |

Planned but left out, because the module would look different: the
`DmsActivityItem` lines of the webhook status (icon in a well),
`DmsCodeSnippet` for the code blocks (DMS frame and copy button), the DMS
form inputs and `DmsBanner` in place of `USwitch` / `UCheckbox` / `UAlert`,
`IdentityDisplay` for the category cell (icon in a tile), one row component
for the declared variables of three panels (each has its own spacing), the
DMS date formatters (they follow the user's regional settings), and the
replay toast reading the suppression reason from the error message (its
wording would change). The front keeps its mirror of the system variables
and of `pickLocale`: the layer is copied on its own and cannot import
`src/engine`.


## 13. Content as code follow-up

Gaps a project hit once it shipped its templates, categories and history as
code (interface 0.8):

| Gap | Decision | Evidence |
| --- | --- | --- |
| A reseeded project cannot take back sends it imported, and re-importing on every boot needs its own "import once" marker | No scoped or replacing import (review Q42): `ImportSends` stays an append-only history import, idempotent by `importId`, called once when the workspace is provisioned | Default data is written once, in `Hook.TENANT_BEING_PROVISIONED`, so nothing replays an import on every boot; a first version with `scope` / `replace` was dropped in review |
| Declared names and category labels are raw strings | Template names and category labels are content written once per language: `@Localized({ fallbackLocale: "en" })` on `mailing_templates.name`, a `{ en, fr }` record on each settings category; declarations take `{ en: "…", fr: "…" }` (review Q42) | Read through `x-content-language` (`@ModifierKey(LocalizationModifier)` on the templates data controller), so search and sort read the real text; `$` i18n keys were dropped with their display (`mailing:template-name`) and frontend glue |
| A fresh install shows "No sender address" | `DeclareSender`, a plain write of the sender called once when the workspace is provisioned, not a module config default and no "kept once a user changed it" rule (review Q42) | A config default would send from an address the settings form does not show, and would apply to every tenant alike; written once at provisioning, the settings are the user's afterwards, so no fingerprint is needed |
| `money` and `date` are labels only | `{ value, currency }` (minor units, the DMS composed-text money shape) and `Date` values format themselves in the send locale; an ISO string formats at a `date` path; other strings and numbers print as given | Existing callers pass pre-formatted strings, which keep their output; a `number` is left alone so order numbers do not get group separators; the engine (`src/engine/formats.ts`) is the only formatter: the layer copy was dropped in review (Q42), and the editor's Data mode shows test values as written |
| Declared templates' gallery thumbnails were empty | Not reproduced, nothing changed | On the demo's own data, the card's request (`POST …/preview { version: "published" }`, no locale) answers 200 with the HTML in the module's tests, and the demo's html-render endpoint renders all seven declared templates (2.8 to 5.8 kB) like the dashboard one |
