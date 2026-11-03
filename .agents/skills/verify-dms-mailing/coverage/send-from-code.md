# Coverage: send-from-code

Journey ids are `send-from-code/<id>`. results = send-template-reports-one-result-per-recipient-and-the-worst-status, refuse = send-template-refuses-what-it-cannot-send, reason = a-suppressed-result-names-its-reason, values = amounts-and-dates-are-written-in-the-locale-of-the-send, modes = test-sends-use-the-draft-and-content-overrides-change-nothing, asked = the-send-log-shows-the-language-asked-when-another-was-sent.

| Behaviour (docs page § section) | Journey | Check |
| --- | --- | --- |
| 5.extending § Send from code: SendTemplate renders a live template and sends | results, modes | status sent, a message in the sink, the published subject |
| § Send from code: `outcomes = result.results ?? [result]`, one result per recipient | results | results holds one entry for one recipient and three for three, in order |
| § Send from code: Sends shows recipient, version and locale used | results, asked, modes | log row version 1, locale and requested locale, recipient name |
| § Send from code: `sent` means the provider accepted it | results | status sent with a message id; failed with the provider down |
| § Send from code: top-level status is the worst, error the first error, sendId and messageId the first recipient's | results | sent, suppressed, sent gives suppressed; suppressed then failed gives failed; first error is the suppressed key |
| § Send from code: a suppressed recipient gets no e-mail and a suppressed result | results, reason | status, key and mail sink |
| FAQ § status suppressed: i18n keys hard_bounce, complaint, unsubscribe, manual | reason | each exact key and the entry named in the send detail |
| § Send from code: `content` sends an alternate body without saving or publishing | modes | alternate subject, next send published again, publishedVersion 1, draft still pending |
| § Send from code: `isTest` prefixes `[TEST] ` | modes | subjects with and without a draft |
| § Send from code: a test uses the draft when there is one | modes | draft subject, version 0 recorded |
| § Send from code: production figures leave tests out | modes | one send and two tests in the figures |
| TSDoc: SendTemplate rejects an unknown slug, a missing recipient, a template that is not live | refuse | the three codes; a test of an archived template goes out |
| TSDoc: a string or a named address | results | recipientName kept |
| TSDoc: `source` labels the log | results | source checkout in the log |
| 5.extending § Amounts and dates: money is `{ value, currency }` in the minor unit, written as currency in the locale | values | en and fr, EUR, a zero-digit currency (JPY), in subject, body, total and list rows, HTML and text |
| § Amounts and dates: an unknown code writes a plain number | values | a four-letter code writes 987,420 |
| § Amounts and dates: a Date is a long date in the send's locale | values | November 14, 2026 and 14 novembre 2026 |
| § Amounts and dates: an ISO day at a path declared date is that calendar day | values | 2026-11-14 in UTC |
| § Amounts and dates: an ISO moment is its day in the server's time zone | values | computed with the server's zone |
| § Amounts and dates: any other value is written as given | values | an ISO string at an undeclared path, 12345, the string `9 874,20 €` |
| § Amounts and dates: a token path reads owned keys, list indexes and length | values | `items.length`, `items.0.name`, `items.5.name` empty, `quote.toString` empty |
| § Amounts and dates: formatting happens at render time (sends, previews, the sent e-mail view) | values | the send and the preview in French; the sent e-mail view is covered by `sends` |
| § Amounts and dates: the send log keeps the values as passed | values | json_variables hold the money object, the ISO day, the Date as ISO, the number |
| § Amounts and dates: the editor's Data mode shows test data as written | Not driven | an editor page behaviour, owned by the templates and editor features |
| § Amounts and dates: a class instance or a function does not compile | Not driven | a compile-time rule of the interface types; the fixture passes JSON |
| FAQ § missing variable | settings | `the-missing-variables-guard-refuses-or-sends-anyway` |
| FAQ § fallback locale, `DE asked` | asked, settings | the log row, the warning-tone line and the Sends page text; the nine locale cases in settings |
| Automation node mailing.send-template | Not driven | the playground loads no module implementing interface-dms-automation |
| Retrying a recipient: read `result.results` first | results | the results array is per recipient and ordered |
