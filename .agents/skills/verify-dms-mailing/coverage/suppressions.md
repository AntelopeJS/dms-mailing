# Coverage: suppressions

Journey ids are `suppressions/<id>`. Short names: contain = a-suppressed-address-gets-no-mail-from-any-send-path, reasons = provider-events-put-an-address-on-the-list-only-when-nothing-more-must-reach-it, http = an-address-is-added-by-hand-and-lifted-over-http, tabs = the-tabs-filter-the-list-by-reason, dialogs = an-address-is-added-and-reactivated-from-the-page, figures = suppressed-sends-have-their-tab-in-sends-and-leave-the-figures.

| Behaviour (docs page § section) | Journey | Check |
| --- | --- | --- |
| 6.suppression-list § An address on the list receives no e-mail | contain | exactly one message to the victim in the mail sink (the pre-suppression one) |
| § How: a permanent bounce adds the address | reasons | hard, permanent, no type with 550, no detail, hard with 4xx answer: entry reason hard_bounce |
| § How: a bounced event is temporary when its type says soft, transient or temporary | reasons | each of the three types: no entry |
| § How: without a type, temporary when the answer is 4xx or 4.x.x | reasons | 452 answer and "Mailbox full 4.2.2": no entry |
| § How: spam complaint | reasons | spam: reason complaint |
| § How: unsubscription | reasons | unsubscribed: reason unsubscribe |
| § How: other events add nothing | reasons | failed, delivered, opened, clicked, queued, sent: no entry |
| § How: by hand with a note up to 500 characters | http | 500 accepted and kept whole, 501 refused with 400 under `note` |
| § How: an address keeps its first reason | reasons | spam then hard bounce: still complaint, still the first send |
| § How: a test send adds only on a permanent bounce | reasons | test hard bounce adds; test spam, unsubscribe and soft bounce do not |
| § What a suppressed address gets: SendTemplate | contain | results in order, suppressed with the manual error key, worst status on top |
| § The test and real send dialogs | contain | real send route (address in capitals) and test route: suppressed |
| § Send again, Send to another address | contain | both replay forms: suppressed, reason as warning |
| § The automation action | Not driven | the playground loads no module implementing interface-dms-automation |
| § Logged with the status suppressed, nothing reaches the provider | contain | five logged sends, error key, stage suppressed, no provider message id |
| § The Sends page has a Suppressed tab; the figures leave them out | figures | tab holds the two blocked sends and not the sent one; stats `sends` is 1 |
| § A test to your own address still goes out with a warning | contain | [TEST] mail arrives; answer carries ownAddressSuppressed |
| § A test to any other suppressed address does not | contain | suppressed result, no warning, no mail |
| § Manage: tabs All, Hard bounce, Spam complaint, Unsubscribed, Added by hand | tabs | counts 8, 3, 2, 1, 2 and the rows each tab holds and does not hold |
| § Manage: Add an address | dialogs | typed address and note stored, toast, row appears; repeat refused in the dialog |
| § Manage: Reactivate takes it off, the next send reaches it | dialogs, contain | confirmation dialog, cancel lifts nothing, confirm lifts; send after reactivation arrives |
| § Manage: See the send | dialogs | menu item only on entries from a send; opens sends?record=<sendId> |
| § HTTP: POST adds, 409 when listed | http | 200 added, 409 with the already message under `email`, also in capitals |
| § HTTP: DELETE removes, 404 when gone | http | 200 removed, then 404 not_found message |
| § The workspace data export carries suppressions.json | access (export journey) | see coverage/access.md |
| FAQ § my code gets a send with status suppressed: error i18n keys | contain, send-from-code | manual key here; the other three keys in send-from-code |
| (implied) invalid address refused | http | 400 with the invalid message and the issue under `email` |
| (implied) address stored trimmed and in lower case | http | entry found by the lower-case address |
| (implied) no session, no access | http | POST as nobody: 401 |
| (implied) search by address or note | tabs | the note search shows one row |
