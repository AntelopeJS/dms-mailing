# Coverage: declarations

Journey ids are `declarations/<id>`. tpl = declare-template-creates-publishes-once-and-keeps-what-the-workspace-has, val = declare-template-validates-like-the-dashboard-and-publishes-nothing-on-failure, cat = declare-template-category-adds-once-and-keeps-existing-ids, sender = declare-sender-writes-the-sender-section-and-later-edits-are-the-users, imp = import-sends-writes-past-sends-with-their-dates-and-events-and-skips-known-ones, bad = import-sends-refuses-bad-payloads-before-writing-anything, noalarm = an-import-raises-no-bell-notification, hook = declarations-made-when-the-workspace-is-provisioned-run-once, loc = declared-names-and-labels-are-read-in-the-language-of-the-reader.

| Behaviour (docs page § section) | Journey | Check |
| --- | --- | --- |
| 5.extending § Ship templates as code: DeclareTemplate creates the template and publishes it as v1 | tpl | outcome created, version 1, live in the table |
| § Ship: SendTemplate can use it at once | tpl | the send is sent |
| § Ship: from then on the template belongs to the workspace; a declared slug already there is kept | tpl | kept after a second declaration; name, category and e-mail unchanged |
| FAQ § code changed a declared template: kept, nothing written, whatever the code declares | tpl | a changed name, subject and category are ignored |
| FAQ: that holds whether it came from a declaration or the dashboard, and after a publication | tpl | kept at version 2 with the user's subject |
| FAQ § does kept mean the template can send: version is the last published, archived stays effective | tpl | kept with version 2, SendTemplate answers template_not_live |
| FAQ: a kept declaration does not check its category | tpl | an existing template in a removed category is kept |
| § Ship: a new slug in an unknown category rejects, nothing is published | tpl | unknown_category and no row |
| § Ship: `author` shown as the author, `system` when absent | tpl | updatedBy system and Acme CI |
| § Ship: DeclareTemplateCategory adds new categories, an id the settings hold stays | cat | created last with labels and icon; kept for a new and a default id |
| § Ship: DeclareSender writes the Sender section | sender | name, address, reply-to read from the settings |
| TSDoc DeclareSender: the declared sender replaces the stored one, later edits are the user's | sender | omitted fields cleared; a later edit stays |
| § Ship: all three need an explicit non-blank tenantId, an explicit default tenant is valid | val, cat, sender | missing, empty and blank refused; `default` created |
| § Ship: name and label hold one text per language, `en` required | val, cat, loc | a name or label without English refused; both languages stored |
| § Ship: each user reads their language, a language without a text shows English | loc | French, English and German readers |
| § Ship: the table searches and sorts that text | loc | search and sortKey in French and English |
| § Ship: a rename writes the language of whoever renames | loc | the French rename leaves the English name |
| § Ship: declarations validate like the dashboard, with a code and the field at fault, publishing nothing | val, cat, sender | 13 + 6 + 6 refusals with their code and the field in the message; no template left |
| § Ship: call from a Hook.TENANT_BEING_PROVISIONED handler registered in construct() | hook | sender, category and template in place on first open |
| § Ship: the DMS fires it once per tenant; later starts run nothing | hook | a second file is not applied after a restart |
| § Ship: never call from start() or DATABASE_INITIALIZED | Not driven | an instruction to project authors; the module cannot refuse it |
| § Ship: a SaaS module fires it for each workspace | Not driven | the playground has one tenant |
| § Ship: a storage failure can reject after publication; category declarations are serialized in one process | cat | three declarations at once keep all; the storage failure is Not driven (needs a failing database) |
| FAQ § upgrade 0.7: a declared template is created already published as version 1; declarations write once | tpl | version 1 at creation |
| FAQ § upgrade 0.7: duplicate slug answers 409 duplicate_slug | Not driven | a template-creation rule owned by the templates feature |
| FAQ § 0.6: all three need an explicit non-blank tenantId | val, cat, sender | see above |
| 5.extending § Import past sends: ImportSends writes past sends with their own date and events | imp | the log date equals sentAt; the figures of three days ago are outside 24 hours, inside 7 days |
| § Import: an import is not a send: nothing delivered, no suppression, no notification | imp, noalarm | empty mail sink; hard bounce and spam suppress nobody; no bell notification |
| § Import: no realtime update or automation follows | Not driven | an absent push cannot be observed reliably; no automation module in the playground |
| § Import: status and counters follow from the events | imp | clicked with 2 opens and 1 click, bounced with its reason, delivered after failed, spam |
| § Import: an entry without events is sent | imp | status sent with one sent event |
| § Import: repeated events are dropped by eventId or equal type, time and details | imp | five events given, three kept |
| § Import: importing the same importId again skips it; not an update key | imp | imported 0 skipped 7, same ids, nothing changed; a mixed batch |
| § Import: a batch can be partly committed, retry with the same payload | imp | a refused batch writes nothing (bad); a partial failure is Not driven (needs a failing database) |
| § Import: importId within a tenant, any length up to 200 | bad | 200 accepted, 201 refused |
| TSDoc ImportSends: result imported, skipped, sendIds in order | imp | exact counts and ordered ids |
| TSDoc: locale defaults to the workspace fallback; source defaults to import | imp | fr and import |
| § Import: imported sends follow the log retention | settings | counted by the retention preview (`the-log-retention-is-bounded-and-previews-what-the-next-run-deletes`); the sweep itself is Not driven |
| ImportSends needs an existing template | bad | template_not_found |
