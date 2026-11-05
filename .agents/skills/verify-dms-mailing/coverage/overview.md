# Overview coverage

Every documented behaviour of `docs/4.usage/1.overview.md`, the journey that drives it and the check that fails when it breaks.

| behaviour (docs page § section) | journey | check |
| --- | --- | --- |
| Period of 7, 30 or 90 days, 30 by default (overview § intro) | default-period-is-30-days-compared-with-the-previous-period; overview-page-shows-figures-and-follows-period-and-comparison | default window: 3 sends in 30 days; 7 days; 90 days; the 30D preset is selected; 7D and 90D figures |
| Compared with the previous period by default (overview § intro) | kpis-count-the-right-sends | Sends 8 against 4, +100% |
| Test sends left out of every figure (overview § intro) | kpis-count-the-right-sends; best-opened-templates-rank-up-to-10-with-5-deliveries-or-more; open-rate-by-domain-ranks-up-to-6-domains-with-5-deliveries-or-more; volume-chart-plots-sends-per-day-with-an-aligned-comparison | Sends 8 not 9; t00 stays out; d0.test stays out; volume 0,3,0,0,1,0,2 |
| Sends to a suppressed address left out (overview § intro) | kpis-count-the-right-sends; volume-chart-plots-sends-per-day-with-an-aligned-comparison | Sends 8 with a suppressed send present; volume without the suppressed send |
| Sends KPI: e-mails sent in the period (overview § Figures) | kpis-count-the-right-sends | Sends 8 against 4, +100% |
| Deliverability KPI: share delivered (overview § Figures) | kpis-count-the-right-sends | 5 of 8 delivered, 62.5 against 50 |
| Open rate: share of delivered opened (overview § Figures) | kpis-count-the-right-sends; engagement-outlives-the-final-status | 80 against 50, a click without open counts; opened and clicked survive a later unsubscribe or spam status |
| Click rate: share of delivered clicked (overview § Figures) | kpis-count-the-right-sends | 40, previous 0 states no change |
| Bounces KPI, lower is better (overview § Figures) | kpis-count-the-right-sends | 1 against 2, -50 |
| Unsubscribes KPI, lower is better (overview § Figures) | kpis-count-the-right-sends | 1 against 0 |
| KPI groups Reach, Engagement, List health with their headings (overview § Figures) | overview-page-shows-figures-and-follows-period-and-comparison | Reach / Engagement / List health chains of the page text |
| Deliverability, open and click rate show no value when nothing reports deliveries (overview § Figures) | delivery-figures-show-no-value-when-nothing-reports-deliveries | no value for the three, Bounces still 0, one reported delivery makes them measured |
| Send volume plots sends per day, compared period dashed and aligned day by day (overview § Figures) | volume-chart-plots-sends-per-day-with-an-aligned-comparison | per-day counts, labels, compared counts 4,0,0,0,0,0,1 on the same axis; the legend names Compared period in the page |
| Needs attention: sends with a problem, Review problems opens the Problems tab (overview § Lower cards) | needs-attention-lists-what-to-act-on; overview-funnel-rankings-and-attention-cards | counts 4 = 1+2+1, test sends left out, link /sends?view=problems, page text and href |
| Needs attention: live templates missing a locale that others have (overview § Lower cards) | needs-attention-lists-what-to-act-on | missing-locales count 1, name Beta |
| Needs attention: a missing sender address (overview § Lower cards) | needs-attention-lists-what-to-act-on | sender-missing alone, gone after DeclareSender |
| Needs attention: deliveries, or opens and clicks, that nothing reports (overview § Lower cards) | needs-attention-lists-what-to-act-on | untracked-delivery, then untracked-rates after one delivery, gone after an open |
| Needs attention: a period that holds only test sends (overview § Lower cards) | needs-attention-lists-what-to-act-on | test-only-window count 2, gone with a real send |
| Needs attention: live templates not sent in the period (overview § Lower cards) | needs-attention-lists-what-to-act-on | unused count 4, then 3; none for a window closed before publication |
| Needs attention: drafts never published and untouched over a week (overview § Lower cards) | needs-attention-lists-what-to-act-on | Only the negative: a fresh draft is not listed. Not driven for the 7 day boundary: a draft's updatedAt cannot be backdated through the product or the fixture |
| Needs attention never compares (overview § Toolbar) | needs-attention-lists-what-to-act-on | same entries for previous-year and none |
| Funnel steps sent, delivered, opened, clicked, unsubscribed with count and rate (overview § Lower cards) | funnel-counts-sent-to-unsubscribed-by-template-kind; overview-funnel-rankings-and-attention-cards | counts and rates per step; page chain Sent 10 ... Unsubscribed 0 |
| Funnel switch All, Transactional, Marketing (marketing category) (overview § Lower cards) | funnel-counts-sent-to-unsubscribed-by-template-kind; overview-funnel-rankings-and-attention-cards | three kinds with exact counts; unknown kind reads as All; Marketing and Transactional radios |
| The card names the biggest drop between two steps (overview § Lower cards) | overview-funnel-rankings-and-attention-cards | Biggest drop: delivered → opened |
| Funnel change column and tooltip count while comparing (overview § Lower cards) | funnel-counts-sent-to-unsubscribed-by-template-kind; overview-funnel-rankings-and-attention-cards | previousCount and delta per step; ▲ 900% in the page. The tooltip text itself is Not driven: a title attribute is not read |
| Best opened templates: up to 10 by open rate, 5 deliveries minimum (overview § Lower cards) | best-opened-templates-rank-up-to-10-with-5-deliveries-or-more | 10 rows in order; 4 deliveries out, 5 in; page chain Promo promo · 7 delivered |
| Open rate by domain: up to 6, 5 deliveries minimum (overview § Lower cards) | open-rate-by-domain-ranks-up-to-6-domains-with-5-deliveries-or-more | 6 rows in order; few.test (4) out, five.test (5) in |
| Each ranking row shows its change against the compared period; none when the compared period had fewer than 5 deliveries (overview § Lower cards) | best-opened-templates-rank-up-to-10-with-5-deliveries-or-more; open-rate-by-domain-ranks-up-to-6-domains-with-5-deliveries-or-more | t11 +83.3, t10 (4 before) none, t09 (5 before) -25; d6 +100, d5 none |
| Rankings empty state (overview § Lower cards) | overview-empty-ranking-and-setup-checklist | both rankings say Not enough delivered e-mails to rank yet |
| Toolbar: provider connected, last updated, Live and Pause, period, comparison, 7D/30D/90D (overview § Toolbar) | overview-page-shows-figures-and-follows-period-and-comparison | Live pressed, 30D checked, comparison menu label; New template button. The "connected" pill and "Updated" text are Not driven (relative time text) |
| Comparison menu: vs previous period, vs previous year, No comparison (overview § Toolbar) | overview-page-shows-figures-and-follows-period-and-comparison; previous-year-compares-the-same-dates-a-year-earlier | three menu items; year window 3 against 2; No comparison removes vs figures, legend and funnel column |
| Every figure follows the comparison: KPI, dashed series, funnel column, both rankings (overview § Toolbar) | overview-page-shows-figures-and-follows-period-and-comparison; best-opened-templates-...; open-rate-by-domain-...; volume-chart-... | No comparison page checks; no row has a delta in both rankings; no compared series |
| Live refreshes every figure as e-mails are sent, at most every 5 seconds (overview § Toolbar) | overview-live-mode-refreshes-figures-and-pause-freezes-them | a new send moves Sends 1 to 2. The 5 second ceiling is Not driven: it needs timing the sink cannot assert reliably |
| Pause freezes the figures (overview § Toolbar) | overview-live-mode-refreshes-figures-and-pause-freezes-them | Sends stays 2 for 8 seconds, then 3 after Live |
| Pause counts the new sends until you resume (overview § Toolbar) | Not driven | the missed-sends label is rendered by the DMS toolbar and was not observed on this page |
| The L key switches between the two modes (overview § Toolbar) | overview-live-mode-refreshes-figures-and-pause-freezes-them | L pauses, L resumes |
| The Sends page shares the same choice (overview § Toolbar) | Not driven | needs the Sends page journey to read the stored choice; see the sends coverage |
| Setup checklist replaces the figures until a provider is connected and a template is live (overview § Setup checklist) | overview-empty-ranking-and-setup-checklist; setup-facts-follow-the-workspace | checklist text with four steps and no KPI; facts liveTemplateCount 0 then 2, draft not counted |
| Four steps Connect a provider, Set the sender, Publish a template, Send yourself a test (overview § Setup checklist) | overview-empty-ranking-and-setup-checklist; setup-facts-follow-the-workspace | step names; isSenderSet after DeclareSender; hasTestSend after a test send |
| Resume the setup reopens the checklist while a step is open (overview § Setup checklist) | overview-empty-ranking-and-setup-checklist | button present, click shows the checklist with publish done and sender open |
| A provider that is not connected hides the figures (overview § Setup checklist) | Not driven | the playground's SMTP provider always answers capabilities; VERIFY_MAILING_PROVIDER=down only breaks sending |
