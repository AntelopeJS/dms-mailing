# Sends coverage

| behaviour (docs page § section) | journey | check |
| --- | --- | --- |
| Log lists every e-mail: recipient, data, locale, what the provider reported (sends § intro) | stage-tabs-hold-their-sends; drawer-explains-the-problem-timeline-origin-and-data | All tab lists the 21 sends; drawer data and timeline |
| Sidebar badge counts real sends with a problem in the last 24 hours (sends § intro) | sends-badge-counts-real-problems-of-the-last-24-hours | link reads Sends 2 (23 h in, 25 h out, test, resolved and delivered out), then Sends 3 |
| Toolbar: period 24H default, 7D, 30D, comparison menu (sends § Toolbar) | stat-strip-states-the-period-figures-and-their-changes | 24H preset; No comparison removes the changes; API previous-period vs none. 7D and 30D switching is Not driven |
| The log never compares (sends § Toolbar) | stat-strip-states-the-period-figures-and-their-changes | footnote text; All tab lists sends outside the period |
| Live: new sends appear at most every 5 s; table holds rows while a send is open, scrolled, searching; "N new sends" strip and Show; Pause holds the page; shares the Overview choice (sends § Toolbar) | Not driven | the live hold needs several realtime events over time and the strip's rendering was not observed; the Overview journey covers Live, Pause and L on the Overview only |
| Stat strip Sends: real sends, tests never count (sends § Stat strip) | stat-strip-states-the-period-figures-and-their-changes | API 11 sends and 2 tests; page SENDS 11 ... + 2 tests, not counted |
| Delivered: share with count (sends § Stat strip) | stat-strip-states-the-period-figures-and-their-changes | 6 of 11, DELIVERED 55% |
| Problems: bounces, failures, spam (sends § Stat strip) | stat-strip-states-the-period-figures-and-their-changes | 4 = 2+1+1, page breakdown |
| Queued: waiting now with oldest wait (sends § Stat strip) | stat-strip-states-the-period-figures-and-their-changes | QUEUED 1 Oldest queued 9 hours ago |
| Median latency of the API call (sends § Stat strip) | stat-strip-states-the-period-figures-and-their-changes | MEDIAN LATENCY 0 ms. A non-zero median is Not driven: imported sends carry no latency and the SMTP latency is not controllable |
| Every figure except Queued states its change and the compared figure; Queued never compared (sends § Stat strip) | stat-strip-states-the-period-figures-and-their-changes | ▲ 83% vs 6, ▲ 9% vs 50%, ▲ 300% vs 1; Queued without a change |
| Tabs All, Problems, In progress, Delivered not opened, Opened or clicked, Unsubscribed, Suppressed (sends § Stat strip) | stage-tabs-hold-their-sends | each tab lists exactly its sends and none other, with its count |
| The Problems tab leaves test sends out (sends § Stat strip) | stage-tabs-hold-their-sends | testfail@ absent from Problems |
| Test sends and Template filters (sends § Stat strip) | Not driven | the quick filter menus were seen (All/Yes/No, template names) but no journey narrows the list yet |
| Locale column shows the locale sent, `DE asked` on a fallback (sends § Stat strip) | locale-column-says-when-the-locale-asked-was-not-sent | EN with DE asked; EN alone; DE alone |
| Click opens the drawer headed by recipient and template and Send N of M (sends § Send details) | drawer-opens-steps-keeps-its-url-and-closes | heading, Send 2 of 21, Send 1 of 5 in Problems |
| Dragging the left edge widens the drawer; wide puts timeline and origin side by side; reopens at the width given (sends § Send details) | drawer-width-is-dragged-and-remembered | width grows, side by side, same width on reopen |
| J and K step through the log; the URL keeps the send; Escape or a click beside closes (sends § Send details) | drawer-opens-steps-keeps-its-url-and-closes | Send 3, 4, 3 of 21; reload reopens; Escape and click-away close. Stepping across pages is Not driven: pages hold 50 sends |
| Problem banner in plain words and the suppression notice (sends § Send details) | drawer-explains-the-problem-timeline-origin-and-data | text per status: permanent and temporary bounce, failure, spam, unsubscribed, suppressed |
| Timeline queued, handed, delivered, opened, clicked with the provider's raw answer (sends § Send details) | drawer-explains-the-problem-timeline-origin-and-data | timeline texts per status |
| Origin: template and version, locale, API latency (sends § Send details) | drawer-explains-the-problem-timeline-origin-and-data | ORIGIN order · v1; locale and latency in each chain |
| Data sent with Copy JSON; View the e-mail renders from the stored version (sends § Send details) | drawer-explains-the-problem-timeline-origin-and-data | pretty JSON, Data copied toast, rendering shows the subject |
| Footer per status (sends § Send details table) | drawer-footer-follows-the-status | 12 statuses with exact footer buttons |
| A suppressed send whose address was reactivated offers Send again… (sends § Send details) | drawer-footer-follows-the-status | footer View the e-mail, Send again… after DELETE |
| Already sent again: View the e-mail, copy (sends § Send details) | send-again-from-the-drawer-is-confirmed-and-resolves-the-problem | footer after the replay |
| Send again… confirmed with recipient, version, last error (sends § Send details) | send-again-from-the-drawer-is-confirmed-and-resolves-the-problem | confirmation text, To/Template/Last try |
| Send to another address (sends § Send details) | send-to-another-address-checks-the-corrected-address; send-again-rules-by-status | dialog text, the three messages, corrected mail, fix-address source |
| Spam is never answered; permanent bounce needs another address (sends § Send details) | send-again-rules-by-status | 409 no_replay_after_spam, 409 replay_needs_new_address, also in other letters |
| Send again resolves the original and links both ways (sends § Send details) | send-again-rules-by-status; send-again-from-the-drawer-is-confirmed-and-resolves-the-problem | stage resolved, replayedBy, replayOf; leaves Problems; Resolved badge |
| Send again to a suppressed address sends nothing and stays a problem (5.extending, sends § Send details) | send-again-to-a-suppressed-address-sends-nothing | status suppressed, warning, original problem, no mail |
| A test sent again stays a test (sends route) | send-again-rules-by-status | copy isTest and [TEST] subject |
| Provider banner when no provider is connected or unreachable (sends § Provider problems) | Not driven | the playground's SMTP provider always answers capabilities |
| Banner when failures pile up: any connection failure, or 3 or more and at least 10% of the hour's real sends (sends § Provider problems) | banner-appears-from-3-provider-failures-and-ignores-what-is-not-the-providers; banner-rate-boundary-is-10-percent-of-the-hours-real-sends; banner-a-connection-failure-raises-it-alone | 2 vs 3 failures; 3 of 30 vs 3 of 31; 1 connection failure of 100 |
| The banner links to the provider settings (sends § Provider problems) | banner-appears-from-3-provider-failures-and-ignores-what-is-not-the-providers | first action to /modules/mailing/settings#provider |
| Send the failures again: up to 100, same version and data; bounces, spam, tests and suppressed failures never part (sends § Provider problems) | send-the-failures-again-sends-up-to-100-and-leaves-out-the-rest; send-the-failures-again-is-capped-at-100 | counts 2/0/1, stages, sink, second run 0, since; 100 of 101 |
| Only the settings action when every failure is suppressed (provider banner) | banner-offers-no-replay-when-every-failure-is-suppressed | single action |
| Test sends need the mailing.send permission; routes that reach recipients are gated (5.extending § Permissions and realtime) | Not driven | the fixture cannot grant module-scoped page permissions, so a member never reaches the gate |
| Test send up to 5 addresses, [TEST] subject, out of the figures (templates § details, editor § Draft) | test-send-and-real-send-rules | 5 ok, 6 refused, invalid refused, [TEST] subject, Sends 1 |
| Real send only on live templates (templates § details) | test-send-and-real-send-rules | draft 422 template_not_live, live 200, source manual |
| mailing:sends realtime topic published on every new send and event, to that workspace only (5.extending § Permissions and realtime) | overview-live-mode-refreshes-figures-and-pause-freezes-them | a new send moves the Overview figure without a reload. Workspace scoping needs a second tenant: Not driven |
