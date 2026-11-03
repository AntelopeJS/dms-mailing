# Coverage: settings

Journey ids are `settings/<id>`. defaults = a-new-workspace-starts-on-the-documented-defaults, patch = a-settings-write-is-a-checked-patch, sender = the-sender-settings-decide-who-every-e-mail-comes-from, guards = the-missing-variables-guard-refuses-or-sends-anyway, locale = the-fallback-locale-picks-the-version-for-a-language-the-template-lacks, rotate = rotating-the-webhook-secret-stops-the-old-one-at-once, testevent = the-test-event-reaches-the-webhook-and-touches-no-send, retention = the-log-retention-is-bounded-and-previews-what-the-next-run-deletes, cats = categories-are-added-renamed-reordered-and-validated, moves = removing-a-category-moves-its-templates-and-the-usage-counts-live-ones, page = the-settings-page-has-five-sections-and-the-save-bar-saves-the-changes, hookpage = the-webhook-section-shows-the-secret-rotates-it-and-tests-the-url, retpage = the-retention-control-previews-the-next-run-and-confirms-a-deletion, catpage = the-categories-editor-adds-renames-reorders-and-asks-where-templates-go.

| Behaviour (docs page § section) | Journey | Check |
| --- | --- | --- |
| 5.settings: five sections with a side navigation | page | five links named Sender, Delivery guards, Provider & webhook, Log retention, Template categories, and five headings |
| 5.settings: the save bar saves your changes | page | bar hidden, raised by a change, Discard restores, Save changes stores and toasts "Settings saved" |
| 5.settings § Sender: name used for every template | sender | From carries the name on SendTemplate, test send and real send |
| § Sender: name applies only with an address | sender, patch, page | name only: From unchanged; the warning notice; the page toast |
| § Sender: address, empty means the provider's default | sender, defaults | From is the provider's address when empty and again after clearing |
| § Sender: reply-to, empty answers go to the sender | sender | Reply-To header only when set, on the three paths |
| § Sender: a template cannot override the sender | Not driven | no template field carries a sender, so there is nothing to attempt |
| § Delivery guards: Refuse the send, Send anyway | guards, patch, page | both policies end to end; stored as blockOnMissingVariables and missingVariables; the radio on the page |
| 3.configuration: default Send anyway | defaults, guards | missingVariables is send on a new workspace and a call with a hole goes out with blanks |
| 3.configuration: a real send from the dashboard refuses a missing required variable whatever this setting says | guards | 422 missing_variables under Send anyway, for an ordinary variable and the unsubscribe URL |
| § Fallback locale: sent when a template has no version in the language | locale | nine cases: language present, regional code, capital letters, none asked, fallback fr, fallback not in the template, template with only fr |
| 3.configuration: fallback default en | defaults, locale | en and the first case |
| § Fallback locale is one of the workspace locales | page | the select offers exactly English and French (the workspace locales, with the line "Workspace locales: EN, FR"); French chosen, saved, stored as fr. The API accepts any well-formed locale (patch journey refuses malformed ones) |
| § Provider & webhook: provider read-only | defaults, patch | provider is nodemailer; a write carrying provider is 400 |
| § Webhook URL | defaults, hookpage | `<dashboard origin>/api/mailing/events/nodemailer/default`; the page field holds it |
| 3.configuration: URL origin falls back to apiBaseUrl then the server's origin | Not driven | the playground fixes clientBaseUrl, so only the first branch is observable |
| 3.configuration: provider lower-cased, runs of other characters become a hyphen, `provider` when none | Not driven | the playground's provider is always nodemailer |
| § Webhook secret: at least 32 characters | rotate | 31 refused with the too-short text under webhookSecret, 32 and 120 accepted and used |
| 3.configuration: pasted secret 32 to 120 characters | rotate | 121 refused, blank refused |
| 3.configuration: generated, 48 hexadecimal characters | defaults, rotate | regexp on the first secret and on a rotation |
| § Webhook secret: Show reveals it | hookpage | masked with the last four characters, then the whole secret |
| § Webhook secret: Rotate… replaces it once you confirm, the old one stops at once | rotate, hookpage | 403 bad_secret with the old one right after, 200 with the new; the dialog on the page |
| § Webhook status: last event with time, type, provider, matched | hookpage, defaults | "Last event: opened, from postmark, matching no send", "Last event: delivered, from postmark", null before any |
| § Webhook status: last refused call and its reason | hookpage | wrong secret, no header, malformed body texts |
| § Webhook status: Send a test event posts from the server with the stored secret | testevent, hookpage | isReceived, URL, HTTP 200, duration, the status "Last event: the test event", after a rotation too |
| § Webhook status: touches no send | testevent | a send carrying the test message id keeps its status, events and revision |
| 5.extending: the test event answers recorded false, test true | testevent | direct post of the test message id |
| § Log retention: 30 days, 90 days, 1 year, custom | retpage | the four radios, the preview and the stored days for each |
| § Log retention: custom between 1 day and 10 years | retention | 1, 365 and 3650 stored; 0, 3651, 1.5, "30" and -5 refused |
| 3.configuration: default 90 days | defaults, retpage | 90 on a new workspace, checked on the page |
| § Log retention: the section shows when the next run happens | retention, retpage | nextRunAt at 03:15 in the server's time zone within 24 hours; the "Next run … at 03:15" line |
| § Log retention: how many sends it will delete | retention, retpage | counts for 1, 3, 30, 35, 90, 365 and 3650 days over ten aged sends; the page line |
| § Log retention: a shorter duration that deletes sends asks for confirmation | retpage | "Delete old sends?" with the count, Cancel keeps the old value, Save and delete stores; shorter with nothing to delete saves without a question |
| § Log retention: a daily job deletes sends and events, never templates | Not driven | the 03:15 job cannot be waited for and no route runs it |
| § Template categories: drag or arrow keys reorder | catpage, cats | Space, ArrowDown, Space on the handle; the stored order; the API reorder survives a restart |
| § Categories: rename, change icon, add | cats, catpage | label and icon rewritten, a sixth category added last with its French labels kept |
| § Categories: removing a category in use asks where the templates go | catpage, moves | the dialog "Remove “Billing”?" with "2 templates use it.", the move to Orders, the notice; no question for an unused one |
| § Categories: marketing can be renamed but not removed | cats, catpage | renamed to Campaigns with its id; a list without it is 400 marketing_required; no Remove button on the row |
| 3.configuration: categories default Orders, Account & access, Billing, Marketing, Forms | defaults | ids, English and French labels, icons |
| 3.configuration: categories array of { id, label, icon } with Phosphor icons | cats | an icon without the prefix, a bad id and a bad move target are 400 |
| (implied) blank and duplicate labels, duplicate ids refused | cats | the three messages under their row |
| (implied) category usage leaves archived templates out | moves | counts billing 2, forms 1, orders 1 with one archived order |
| 3.configuration: GET reads, PUT writes only the changed fields | patch, page | retention changed elsewhere survives a page save |
| 3.configuration: the write refuses any field it does not know, webhookUrl and provider among them | patch | unknown, webhookUrl, provider and an array body: 400 invalid_settings |
| (implied) a cleared field is stored empty | patch | null for the three sender fields |
| (implied) the settings persist | patch, retention, cats | read back after a backend restart |
| FAQ § webhook URL points to localhost | Not driven | see the URL origin row |
