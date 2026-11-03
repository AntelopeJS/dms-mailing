# Coverage: rendering

Journey ids are `rendering/<id>`. mp = every-e-mail-is-multipart-alternative-with-html-and-plain-text-from-the-same-blocks, ft = footer-links-are-system-variables-dropped-when-missing-or-unlabelled, hr = use-html-render-picks-the-renderer-and-a-failing-renderer-falls-back.

| Behaviour (docs page § section) | Journey | Check |
| --- | --- | --- |
| 5.extending § What a recipient receives: an HTML part and a plain-text part (multipart/alternative) | mp | top type, exactly two parts in the order text/plain, text/html |
| § What a recipient receives: generated from the same blocks | mp | the HTML holds every block in order; the text is exact, block by block |
| § What a recipient receives: the HTML carries a viewport meta tag | mp, hr | the exact tag in the DMS chain and in the standalone renderer |
| (plain text rules) hero alt, code, list, total, button, divider, footer | mp | the whole expected text |
| (plain text rules) French label separator | mp | `Total : 48.00` and the other labels |
| (all send paths) | mp | the test send and the real send are multipart too |
| § Footer links: an unsubscribe or preferences label shows the links from unsubscribeUrl and preferencesUrl | ft | both links in HTML and text |
| § Footer links: a link whose URL is missing is dropped | ft | no preferences link, the unsubscribe link stays |
| § Footer links: an empty label removes the link | ft | URL passed, no link |
| (empty footer) | ft | the text part is the paragraph alone, no divider |
| § Footer links: `{{unsubscribeUrl}}` anywhere declares the variable, required in marketing | settings (guards) | a marketing send without it is refused naming unsubscribeUrl |
| § Footer links: manual real send refused; under Refuse every send except a test | settings | `the-missing-variables-guard-refuses-or-sends-anyway` |
| § Footer links: starters and non-marketing templates get a footer without links | Not driven | creating a template from a starter belongs to the templates feature; no check here |
| § Header logo: from branding.logo.email.light, else default.light, made absolute with clientBaseUrl | Not driven | the branding is the dashboard front end's app config, built into the DMS front end, not changeable per run |
| § Header logo: dark mode gets branding.logo.email.dark | Not driven | same reason |
| § Header logo: left out for a non-http(s) URL, localhost, private IP, .local .localhost .internal, SVG | hr | the default logo is an SVG at a private host: no `<img>` in the DMS chain or the standalone renderer; the other hosts and schemes are Not driven (branding) |
| FAQ § logo missing: the standalone renderer draws no logo | hr | no image |
| 3.configuration § useHtmlRender default true: DMS html-render chain | hr | lower-case doctype and the DMS layout markup when unset and for `1` |
| § useHtmlRender false: the module's standalone HTML renderer | hr | upper-case doctype, 600 pixel table, hidden preheader span, viewport tag, ordered blocks |
| § The module falls back when the DMS renderer fails and logs `[dms-mailing] html-render unavailable, using fallback` | hr | the send is sent, the e-mail is the standalone one, the backend log holds the exact line |
| § useHtmlRender false does not log a fallback | hr | nothing logged for the `0` configuration |
| (text part independent of the renderer) | hr | the same text for the chain, `0`, `1` and the fallback |
| § The editor canvas draws the same footer and a header from default.light only | Not driven | an editor page rule of the editor feature |
