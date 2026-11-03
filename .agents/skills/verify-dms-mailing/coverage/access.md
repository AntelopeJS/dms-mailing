# Coverage: access

Journey ids are `access/<id>`. routes = every-mailing-route-answers-401-without-a-session-and-403-to-a-member, hook = the-webhook-is-the-one-route-that-needs-no-session, pages = the-mailing-pages-are-the-owners-only, live = new-sends-and-events-appear-on-an-open-sends-page-without-a-reload, export = the-workspace-data-export-carries-templates-versions-settings-and-suppressions.

| Behaviour (docs page § section) | Journey | Check |
| --- | --- | --- |
| 5.extending § Permissions: `mailing.send` gates each route that reaches recipients (test send, real send, send again, send the failures again) | Not driven | a member never passes the page guard of the Sends page, so the gate (`missing_send_permission`) is unreachable in a single tenant; `routes` shows the page guard answers first for all four routes |
| § Permissions: `mailing.send` depends on the Sends page | routes | a member holding both is still refused with the page permission named |
| (guards) every route needs a session | routes | 401 for nobody on 20 routes |
| (guards) every route names its page permission | routes | the exact `Forbidden: missing permission …` text per route |
| (guards) the owner passes | routes | every GET answers 200 |
| (guards) the refusal is the permission's, not the account's | routes | a role granting `*` reads the settings |
| (guards) module pages are owner-only | pages | five pages for the owner; a member lands outside /modules/mailing and has no Mailing link |
| 5.extending § Webhook: the endpoint is public, the secret is its gate | hook | 403 missing_secret for nobody and for a session, 200 with the secret |
| § Permissions: realtime topic `mailing:sends` is published on every new send | live | an open Sends page says "1 new send" and Show lists it |
| § Permissions: ... and every event | live | the open page's figures read "Problems 1 vs 0 · 1 bounce" after the webhook event |
| § Permissions: to that workspace only | Not driven | the playground has one tenant |
| § Permissions: the Overview page subscribes too | Not driven | the Overview page belongs to the overview feature |
| § Permissions: the module adds templates.json, template-versions.json, settings.json, suppressions.json to the workspace data export | export | the four entries under the module folder and in the manifest |
| (export) complete data, paged by 200 | export | 201 suppression rows once each |
| (export) names in every language | export | name en and fr in templates.json |
| (export) template versions | export | versions 1 and 2 present |
| (export) settings without the webhook secret | export | no field, the secret absent from the file |
| (export) the module's contributor does not fail | export | partial false, no failure, manifest module not failed |
| 5.extending § Retention internals (sweep, retirement, orphan events) | Not driven | the 03:15 job cannot be waited for and no route runs it |
