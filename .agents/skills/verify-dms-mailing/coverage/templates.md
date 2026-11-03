# Coverage: templates

Sources: docs/4.usage/2.templates.md, README Slugs, 5.extending (ship templates), 6.faq.

| Behaviour (page, section) | Journey | Check |
|---|---|---|
| A slug is unique per workspace; a taken slug on create or duplicate answers 409 `duplicate_slug` (README, Slugs) | a-slug-is-unique-trimmed-and-bounded | a taken slug is refused with 409 duplicate_slug on create and on duplicate |
| Slug and name are stored trimmed | a-slug-is-unique-trimmed-and-bounded | slug trim-me, name Trimmed |
| Slug is lower-case, starts alphanumeric, no spaces, at most 64 characters | a-slug-is-unique-trimmed-and-bounded | slug rules |
| The slug cannot change once the template exists (Templates, Create a template) | a-slug-is-unique-trimmed-and-bounded | the slug is immutable |
| Name is at most 120 characters, required, not blank | names-categories-and-sources-are-checked | create guards |
| A category must be declared; null clears it | names-categories-and-sources-are-checked | create guards, edit guards and clearing |
| An unknown source template is refused 404 | names-categories-and-sources-are-checked | refused 404 template_not_found |
| Duplicate copies every locale, the variables and the test data into a new draft | a-copy-keeps-every-locale-variable-and-test-datum | both copies are drafts |
| The four starters, their names, slugs, categories and locales | the-four-starters-arrive-as-drafts-with-variables-and-test-data | the starters |
| A starter arrives as a draft with variables and test data (Introduction) | the-four-starters-arrive-as-drafts-with-variables-and-test-data | arrives as a draft |
| A starter previews in the locale asked, else the fallback | the-four-starters-arrive-as-drafts-with-variables-and-test-data | previews in the locale asked |
| An unknown starter is refused | the-four-starters-arrive-as-drafts-with-variables-and-test-data | an unknown starter is refused |
| Draft: Publish, Archive; Live: Unpublish, Archive, Publish; Archived: Restore; other moves 409 (Template details) | lifecycle-moves-follow-the-status | all steps |
| A locale with an empty subject stops the publish | lifecycle-moves-follow-the-status | a blank draft has an empty English subject and cannot publish |
| Publishing creates version 1, then 2 | lifecycle-moves-follow-the-status | version 1, version 2 |
| Restore brings an archived template back as a draft | lifecycle-moves-follow-the-status | restore brings an archived template back as a draft |
| An unpublished or archived template refuses sends (Template details) | an-unpublished-or-archived-template-refuses-sends | a template out of use refuses the send |
| Only an archived template that was never sent can be deleted; versions go with it; the slug is freed | delete-takes-only-an-archived-template-never-sent | all checks |
| The gallery groups by category, status shown on cards, tabs All/Live/Drafts/Archived hold their statuses with counts | the-gallery-groups-by-category-and-filters-by-status | tabs count, tab contents |
| A live template with unpublished edits shows Draft changes | the-gallery-groups-by-category-and-filters-by-status | the cards show their status |
| Needs attention holds live templates with no real send in 30 days | needs-attention-lists-live-templates-without-a-real-send | two live templates without a send, the sent template left the tab |
| New template (button and N key) opens a dialog; slug derived from the name; Ctrl+Enter creates and opens the editor | the-new-template-dialog-derives-the-slug-and-creates-with-the-keyboard | all checks |
| The drawer's tabs and footer | the-details-drawer-opens-with-its-tabs-and-footer | FAILS at the head: product finding, ~/.cache/campaign/issues/dms-mailing-template-drawer-500.md |
| More actions offers only the moves the status allows; Send to real recipients on live templates only, up to 5 addresses, acknowledgement | Not driven | blocked by the drawer finding (the drawer does not open) |
| Test, real send and send again need `mailing.send` | Not driven here | the access feature drives the permission |
| Needs attention: drafts never published and untouched over a week | Not driven | a draft cannot be aged: updatedAt is written by the server |
| Needs attention: live templates missing a locale that another live template has | Not driven | needs a second live locale set; left to the gallery chips |
| Thumbnail renders as the card scrolls into view, "Preview unavailable" when it cannot | Not driven | the thumbnail is an iframe the harness does not read |
| Table display lists the same templates | Not driven | the radio is driven by nobody; no check reads the table view |
| Ctrl+Enter / Cmd+Enter in the dialog on macOS | Not driven | the harness runs Chromium on Linux (Control) |
