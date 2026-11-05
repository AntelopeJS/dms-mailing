# Coverage: webhook

Journey ids are `webhook/<id>`. refuse = a-refused-webhook-call-gets-its-status-and-reason-and-shows-in-the-status, proxy = the-webhook-is-reachable-through-the-dashboard-url-with-the-header-passed-on, order = a-send-status-only-moves-forward-and-counts-opens-and-clicks, retry = a-retried-webhook-event-is-recorded-once, record = record-email-event-does-what-the-webhook-does, notify = owners-get-one-bell-notification-per-template-and-hour-at-three-problems-and-five-percent.

| Behaviour (docs page § section) | Journey | Check |
| --- | --- | --- |
| 5.extending § Webhook contract: header carries the secret | refuse, proxy | right secret recorded true, no header 403 missing_secret, also through the dashboard |
| § Fields: messageId required | refuse | empty and missing message id: 400 invalid_event |
| § Fields: type is one of nine | refuse, order | unknown type 400; every one of the nine types posted and recorded |
| § Fields: at is an ISO date, now by default | retry, refuse | given time stored; default within a minute; bad date 400 |
| § Fields: details.reason shown in the log | order | the failed and bounced words become the send's error |
| § Fields: details.bounceType and the SMTP class | suppressions/reasons | every bounce type and answer class |
| § Fields: details.eventId retried webhook ignored | retry | same id false, other url same id false, new id true, same id other type false |
| § Fields: details.url, userAgent kept | retry | details stored as JSON |
| § Answer 200 recorded true / false | refuse, retry | true for a match; false unmatched, false repeated |
| § Answer: unknown message id | refuse | recorded false and the status shows it unmatched |
| § Answer: retention deleting the send gives false | Not driven | needs a send retiring between lookup and write; the sweep cannot be triggered |
| § Answer: the settings' test event {recorded false, test true} | settings/webhook-test-event | see coverage/settings.md |
| § Recorded: appended to the timeline | order | event types in the timeline in order, 18 after 17 posts |
| § Recorded: status moves forward only in the listed order | order | 17 steps from sent through bounced, never back |
| § Recorded: after failed an event from delivered on replaces it | order | nine failed-then-event cases, delivered through bounced replace it; queued, sent, failed do not; the error is cleared or replaced |
| § Recorded: hard bounce, spam, unsubscription suppress; on a test only a hard bounce | suppressions/reasons | see coverage/suppressions.md |
| § Recorded: 3 problems and 5 percent in the last hour notify the owners | notify | 4 of 100 none, 5 of 100 notifies (5%); 2 of 10 none, 3 of 10 notifies |
| § Recorded: one notification per template and clock hour | notify | five problems, one notification; four templates, four notifications; params count and rate exact |
| § Recorded: only real sends count | notify | 4 test problems and 2 real ones: none; test events never notify |
| § Recorded: problems are bounced, failed, spam | notify | 3 unsubscriptions and 2 opens none; spam, failed, bounced together notify |
| § Recorded: last hour window | notify | 3 problems on 70 minute old sends none; 3 of 7 recent sends at 43% notifies |
| § Recorded: the tenant owners, not other members | notify | a member's bell has no mailing notification |
| § Refusals: 403 missing_secret, 403 bad_secret, 400 invalid_event | refuse | exact status, error, reason and readable message |
| § Refusals: bad_secret also for a workspace without settings | refuse | unknown workspace 403 bad_secret |
| § Refusals: the secret is checked before the body | refuse | invalid body with a wrong or missing secret gives 403 |
| § Refusals: the status shows the last event and the last refusal | refuse | lastRefused reason and provider after each refusal; lastReceived type, provider, matched |
| § Refusals: a refusal for a workspace without settings is not recorded | Not driven | the status of a workspace without settings cannot be read through any route; the real workspace's status is shown unchanged |
| § Relaying a provider | Not driven | the relay is the customer's code; the call it makes is the webhook post driven above |
| § Relaying: through the dashboard's public endpoint, header passed on | proxy | 200 with the header, 403 missing_secret without |
| § RecordEmailEvent(tenantId, event) | record | true, false unknown, false repeated id, status and opens, hard bounce suppresses with detail and send id |
| FAQ § My provider's webhook calls are refused: reasons | refuse | the three reasons and the status |
| FAQ § webhook URL points to localhost | settings/webhook-url | see coverage/settings.md |
| Automation trigger mailing.email-event | Not driven | the playground loads no module implementing interface-dms-automation |
