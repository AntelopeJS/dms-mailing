---
title: Mailing on DMS v2, the grill-me session (part 1)
description: Decision log of the Mailing module's v2 redesign, sections 1 to 5. Dependencies, permissions, data model, templates and sends.
mode: explanation
---

This is the decision log behind the move of `@antelopejs/dms-mailing` to
`dms` 0.6 / `interface-dms` 0.4 / `dms-frontend`
0.5 and to the v2 design (`dms-design-mockup/modules/mailing`, UX review
ML-01 → ML-18).

It was run as a grill-me where the interviewer answers its own questions: every
question carries the recommended answer, and that answer is what the pull
request implements. Read it next to the diff: each section names the files it
drives.

Sources read before the session:

- `dms` `CHANGELOG.md`, `docs/02.building/13.migration-0-3-to-0-4.md`,
  `14.settings-pages.md`, the `interface-dms/src` sources and the PR #119 notes.
- `dms-frontend` `CHANGELOG.md` (0.4: module auto-imports, 0.5: component
  prefix, no private components) and `templates/vue/frontend-module.ts`.
- The mockup pages `index`, `templates`, `editor`, `sends`, `settings` and the
  UX review `review.html`.
- The current module, its tests, and a baseline run of them against DMS 0.6
  (121 passing, 22 failing: every integration test, on the new onboarding
  payload).

---

## 1. Dependencies and breaking changes

### Q1.1 Which ranges do we pin?

**Answer.** Exactly the ones DMS 0.6 accepts, so one copy of each interface
resolves:

| Package | Range |
| --- | --- |
| `interface-dms` | `>=0.5.13 <1.0.0` (module and playground; 0.5.10 types `publicEndpoints` and visible `queryParamFilters`, 0.5.13 the `showRow` prop of a row panel) |
| `interface-data-api` | `>=0.2.1 <1.0.0` |
| `interface-database` | `>=0.1.9 <1.0.0` (interface-data-api 0.2.1 calls its `IsStream`) |
| `interface-database-decorators` | `>=0.1.7 <1.0.0` |
| `dms` (shared module sources) | `>=0.7.21 <0.8.0` (0.7.15 ships the fixes listed in §12, 0.7.20 reopens a closed record link, 0.7.21 gives a row panel `showRow`) |
| `mongodb` (shared module sources) | `>=1.4.2 <2` (stores `$`-prefixed strings) |
| `dms-frontend` (playground) | `0.5.5` |
| the renderer entry of `engines` (layer and playground layer) | `>=0.5.5 <0.6.0` (public endpoints, e-mails without SSR markers, proxy refuses foreign request targets) |

The repository's own lint (`antelopejs-check-interface-ranges`) requires an
interface range open up to the next breaking release, so `interface-dms`
keeps `<1.0.0` with its floor raised to 0.4. What pins the runtime is the
`@antelopejs/dms` module range (`>=0.7.21 <0.8.0`) in the shared module
sources, which the tests and the playground both boot.

### Q1.2 What breaks at compile time or at registration?

**Answer.** Fix each, in the same pull request:

- `TableViewTab.filters: [...]` became `filter: {...}` (templates and sends
  pages). Both tab sets are replaced anyway (§4, §5).
- `confirm` moved from the `api` target to the action, and `confirmColor`
  became `color` (archive, replay). Same rename in `useConfirm` calls.
- `<DmsBanner color>` became `tone`.
- A table whose tabs or views count rows needs a `countBatch` route: the sends
  controller gets `TableViewRoutes.CountBatch`.
- The quick action `openForm` targets a table whose `add` is off: it becomes a
  `button` target on the "New template" button, which inherits its permission.
- The integration helper registers the owner with `firstName` / `lastName`
  (DMS 0.6 onboarding schema). This is what failed the 22 baseline tests.

### Q1.3 The settings form now sends only the fields that changed. What happens?

**Answer.** Today the route parses the body as the full settings. With DMS 0.6
the form posts a partial body, so the save answers 400, and a body that carries
only optional fields would reset `categories` to `[]` and strip the category of
every template. The route merges the patch over the stored values before
validating, and only re-homes templates when `categories` is part of the patch.
An integration test covers the partial post.

### Q1.4 Which frontend prefix do the module's components take?

Options: keep `DmsMailing*` (no rename) or `Mailing*`.

**Answer.** `componentPrefix: "Mailing"`. Since `dms-frontend` 0.5, `Dms` is the
DMS's own prefix: a module registering `DmsMailingEditor` squats the core's
namespace and would be shadowed the day the core ships a `DmsMailing…`
component. Every backend `CustomComponent("DmsMailing…")`, every
`resolveComponent` and the block component map are renamed to `Mailing…`
(blocks: `MailingBlockHero`, …). The cost is a mechanical rename; the tests pin
the new names.

### Q1.5 Auto-imports: declare them or import explicitly?

**Answer.** Import explicitly, declare nothing. `dms-frontend` 0.4 stopped
auto-importing a module's code, and a declared directory is not scoped to the
module: every export becomes a global of the whole application. The layer's
utils carry generic names (`deepClone`, `slugifyId`, `groupByCategory`) that
would collide with another module's sooner or later. The DMS's own composables
(`useI18n`, `useModal`, `useAuthFetch`, …) stay globals, as the DMS declares
them; the module's composables, utils and types are imported by path, which
also lets vitest load them without stubs.

### Q1.6 Do the e-mail templates (`dms.email.ts`) change?

**Answer.** No contract change: `serverEmailTemplates` is still read and
`EmailLayout` / `EmailButton` keep their props. Only the component names inside
`MailingBlocks.vue` follow the prefix rename.

---

## 2. Permissions and page declarations

### Q2.1 The brief asks for `.meta()` with i18n on every custom block, for the
roles screen. Where does that title show?

**Answer.** Every custom block (`CustomComponent`) and the settings form get
`.meta({ name, description, icon })` with `$dms_mailing.permissions.*` keys, and
the registered `mailing.send` permission gets i18n keys instead of English
literals.

One thing the session found and the PR documents rather than hides: in DMS 0.6
the pages of a **module** are platform-owner-only. `isInsideModule` marks their
permission ids module-scoped, and `registersComponentPermissions()` keeps their
component and action permissions out of the grantable tree. So today these
titles are not listed in the Roles form; they name the components wherever the
DMS names a component (the permission tree the moment the DMS opens module
pages to roles, the role preview veil, diagnostics). The metas are still
required: a block without one is registered under its technical name.

### Q2.2 Settings: stay under the workspace Settings, or move into the module?

**Answer.** Into the module, as the mockup and ML-13 ask: a `Configure`
category in the module sidebar with a `settings` page. DMS 0.6 forbids a page
that declares a `module` under the settings root, and both of the module's
audiences (developer, ops) look for mailing settings in the mailing module.
Consequences, accepted: the settings page becomes owner-only like the rest of
the module, its permission id changes from `settings.mailing.settings` to
`modules.mailing.settings`, and the layout becomes `DefaultLayout({ fullWidth:
false })`.

One consequence of the module's own categories (Mailing, Configure): the
permission ids carry them, `modules.mailing.main.sends`,
`modules.mailing.configure.settings`.

### Q2.3 Does every page keep a backend declaration?

**Answer.** Yes, all of them: `overview`, `templates`, the editor (`templates/:id`),
`sends`, `settings`. No page is a frontend-only route. The editor becomes a
record page of Templates (`urlSlug: "templates/:id"`, hidden from the menu), so
the breadcrumb reads Mailing › Templates › *template name* (ML-18). Every link
the module builds (top templates, attention items, send drawer) moves to the
new URL.

### Q2.4 Who may send for real?

**Answer.** Keep the registered `mailing.send` permission and the server check
on every route that reaches recipients (test send, real send, send again).
Owners hold `*`, so behaviour is unchanged today; the check is what will gate
non-owners when module pages become grantable.

---

## 3. Data model

### Q3.1 ML-01 asks for a draft next to the published version. How is it stored?

Options: (a) a `json_draft` column next to the published `json_content`, plus a
versions table; (b) a versions table only, the template pointing at the live
row; (c) keep one content and add an "is published" flag.

**Answer.** (a).

- `mailing_templates.json_content` stays **the published content**, so
  `SendTemplate`, the engine and every existing reader keep reading the column
  they read today and never see a draft.
- New `json_draft` (empty when there is nothing unpublished), `draftUpdatedAt`,
  `draftUpdatedBy`, `publishedVersion` (number, 0 when never published) and
  `publishedBy`.
- New table `mailing_template_versions` (`templateId`, `version`,
  `json_content`, `json_variables`, `locales`, `publishedAt`, `publishedBy`,
  `json_changes`), one row per publish, never updated.
- The editor autosaves into `json_draft`. **Publish** copies the draft into
  `json_content`, writes the version row and bumps `publishedVersion`.
  **Discard** empties `json_draft`.
- A template that was never published keeps editing the draft; its first
  publish is v1.

Option (b) moves every reader onto a join; (c) cannot answer "customers still
get v12".

### Q3.2 Existing tenants: migration script or lazy defaults?

**Answer.** Lazy defaults, no migration step to forget. A live template with no
`publishedVersion` reads as v1 published at `publishedAt`; the versions table is
filled from the first publish on. A row with no `json_draft` has no pending
changes.

### Q3.3 What does a send remember, so the log can answer ML-14 and the
"Rendering" view?

**Answer.** Two new fields on `mailing_sends`:

- `templateVersion`: the version the send used (0 for a draft test send). It
  feeds "Payment failed · v3" in the drawer and lets "Rendering" re-render the
  exact content that went out from the version row plus the stored variables.
- `requestedLocale`: the locale the caller asked for. When it differs from
  `locale` (the one used), the log shows `DE → EN` and the editor counts the
  recipients affected (ML-14).

Storing the rendered HTML on every send was rejected: retention keeps 90 days
of sends by default, and the version row plus the variables reproduce the HTML.

### Q3.4 The send log needs five job-oriented tabs (ML-09). A view filter is
AND-only and `is` compares one literal. How do we filter "Problems"?

**Answer.** Store a derived `stage` on each send (`problem`, `in_progress`,
`delivered`, `engaged`, `unsubscribed`), written by the single place that writes
`status` (record + provider events), indexed. The tabs filter on `stage`.
Every send is written with its stage; there is no backfill (see §12: a 0.3
database is not read).

### Q3.5 `mailing_templates` stores per-locale content by hand
(`pickLocale` / `fallbackLocale`). Should it move to `@Localized`?

**Answer.** No, keep the hand-made per-locale tree. `@Localized` stores one
value per locale for a **scalar field** and reads back the caller's locale. A
template's content is a block tree whose structure differs per locale, the
editor needs every locale at once (coverage chips, "Duplicate from EN", missing
locale state), the send picks the locale of the **recipient**, not of the
request, with a tenant fallback, and a published version must snapshot every
locale together. None of that maps onto a localized scalar. The name of a
template is not translated today and the mockup does not ask for it.

### Q3.6 "Needs attention" on the templates gallery mixes drafts, never-sent
live templates and missing locales. Stored flag or computed?

**Answer (revised in §12).** Stored, refreshed by the server. The reasons
are worked out once in `src/services/attention.ts` (a draft never published
left aside for a week, a live template no real send used in 30 days, a live
template missing a locale the other live ones carry) and kept on the template
(`attention`, `needsAttention`), so a TableView tab filters on one column and
counts it on the server. Template writes, the first real send of a flagged
template and an hourly cron keep it current. The first answer computed it in
the browser, which meant a second copy of the rules and of the table's filter
grammar.

---

## 4. Templates

### Q4.1 Keep the custom gallery display or switch to the built-in cards display?

**Answer.** Keep the `mailing:gallery` display: the built-in cards display has
no grouping, and the gallery is grouped by category. Rework the card to ML-12:
status pill on every thumbnail, locale chips next to the slug (missing ones
dashed, clickable), a `sends · open rate · last edit` footer, an info button
that is always visible, hover actions that also show on focus.

### Q4.2 Tabs?

**Answer.** All · Live · Drafts · Archived as TableView tabs on `status` with
counters; All hides archived templates and publishes the Templates nav badge.
"Needs attention" is a fifth tab, filtering on `needsAttention` (Q3.6);
`?tab=attention` opens it.

### Q4.3 New template?

Review items ML-15 and ML-16.

**Answer.** A custom modal (`MailingNewTemplateModal`), because a data-type
form cannot derive the slug from the name or show thumbnails: name, slug
derived from the name until edited, inline validation (format and uniqueness
against the loaded list), category, "Start from" with Blank plus existing
templates as thumbnails. "Create and open the editor". Shortcut **N** on the
gallery.

### Q4.4 Empty gallery?

**Answer.** First run shows four starter templates (order confirmation,
shipping update, password reset, invoice available) that arrive as drafts with
their variables and test data declared. A search with no match offers "Reset
filters" (which actually resets them, ML-15) and `Create "<search>"`.

### Q4.5 Template details drawer?

**Answer.** Rebuilt to the mockup: header with status pill and
`slug · vN · edited … by …`, tabs Preview / Variables / Performance. Preview
has the locale switch, the thumbnail and the missing-locale callout ("Create
DE" opens the editor on that locale). Performance shows the 30-day sends, open
rate, problems and "Called from" (sends grouped by `source`). Footer: Test,
Duplicate (dialog prefilled with "(copy)" and a derived slug), Open the
editor. The lifecycle menu only offers the valid transitions (ML-16).

### Q4.6 Test send vs real send?

Review items ML-02 and ML-04.

**Answer.** Two dialogs.

- **Test**: works for every status, recipients as chips (max 5, visible
  counter, prefilled with the current user), locale, data set (test data or
  none). The subject gets a `[TEST]` prefix server-side, the send is flagged
  and left out of the business figures.
- **Real**: only offered on live templates, from its own red action. Chips
  with counter, a review box (From, Subject, Version, Data), an
  acknowledgement checkbox; the button reads "Send to N recipients" and stays
  disabled until ticked. A draft gets the refusal variant with "Send a test
  instead" and "Review and publish".

---

## 5. Sends

### Q5.1 Tabs and filters?

**Answer.** All · Problems · In progress · Delivered · Opened or clicked, on
`stage` (Q3.4), with counters; Problems is tinted error and publishes the nav
badge of the Sends page. Quick filters: test sends, template. Default sort:
newest first. The log defaults to the last 24 h and says so in the period
control.

### Q5.2 Columns?

**Answer.** Built-in displays first: recipient as `IdentityDisplay`
(name, e-mail as subtitle, a `TEST` badge on test sends), template as
`MonoDisplay`, status as `StatusPillDisplay` with the error inline
(`subField: "error"`), source as `MonoDisplay`, latency as
`DurationDisplay({ unit: "ms" })`, sent as `RelativeDateDisplay`. The locale
column with the `DE → EN` fallback is the one custom column display
(`mailing:locale`). The red rail on problem rows has no DMS equivalent
(TableView has no row tone): the status pill and the inline error carry it.

### Q5.3 Stat strip?

**Answer.** A stock `StatGroup` reading `/sends/stats` with the page's
`periodScope` and the sends realtime topic (DMS 0.7.2). Sends (with
"+N tests, not counted"), Delivered, Problems (breakdown), Queued ("oldest
waiting …"), Median latency. One route answers the five figures.

### Q5.4 Send drawer?

Review items ML-03 and ML-17.

**Answer.** Footer by status:

- **bounced / spam**: primary "Fix the address" opens a dialog that sends the
  same version and data to a corrected address; no "send again" to the same
  address.
- **failed** (provider): primary "Send again…", confirmed in an amber dialog
  that names the recipient, the version and the last error.
- **otherwise**: "Send again…" as a ghost button.

Plain-language problem banners by status and SMTP class ("This address doesn't
exist", "<provider> didn't answer in time · sending again is safe"), the raw
code kept in the timeline; provider named, message id in mono, pending steps
ghosted. Origin rows (template · vN, source), the data sent with Copy JSON,
and "Rendering" (desktop / mobile / HTML) re-rendered from the version (Q3.3).

### Q5.5 Provider down?

**Answer.** A banner above the log when the provider cannot be reached or when
provider failures piled up in the last hour, with "Provider settings" and
"Send N again…" (replays the provider failures of that hour, after a
confirmation). Bounces are never part of it.

Sections 6 to 13 continue in [part 2](./design-v2-grill-me-2.md).
