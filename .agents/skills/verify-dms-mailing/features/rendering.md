---
covers:
  - packages/dms-mailing/src/services/send.ts
  - packages/dms-mailing/frontend-vue/dms.email.ts
  - packages/dms-mailing/src/services/render.ts
  - packages/dms-mailing/src/engine/fallback-html.ts
  - packages/dms-mailing/src/engine/plain-text.ts
  - packages/dms-mailing/src/engine/system-variables.ts
  - packages/dms-mailing/src/config.ts
  - packages/dms-mailing/frontend-vue/app/emails/**
docs:
  - packages/dms-mailing/docs/5.extending.md
  - packages/dms-mailing/docs/3.configuration.md
  - packages/dms-mailing/docs/6.faq.md
---

# Rendering

What a recipient receives: the multipart message, the HTML and plain-text parts, the viewport tag, the footer links, the logo rule and the `useHtmlRender` option with its fallback.

## Sub-features

- `every-e-mail-is-multipart-alternative-with-html-and-plain-text-from-the-same-blocks`: the structure, the plain text of every block kind, French labels, the three send paths.
- `footer-links-are-system-variables-dropped-when-missing-or-unlabelled`: both links, a missing URL, an empty label, an empty footer.
- `use-html-render-picks-the-renderer-and-a-failing-renderer-falls-back`: the DMS chain, the standalone renderer, a failing renderer and its log line, the same text, no logo.

## How to get to it (user POV)

- The e-mail itself in the recipient's inbox; the module option `useHtmlRender` in `antelope.config.ts`.

## Driving it with dms-control

```bash
dms-control journey "$RUN" rendering
```

The journeys read the raw message files of the mail sink (`message.file`), decode quoted-printable and RFC 2047 words, and set `VERIFY_MAILING_HTML_RENDER` to `0`, `1` or `broken` (a render endpoint nothing listens on) through `withConfig`.

## Gotchas

- The fixture change that makes `broken` possible is in `playground/antelope.config.ts`.
- The DMS branding logo is an SVG, so no logo is ever drawn in the playground; the other logo rules cannot be driven.
- The backend log is read by byte offset; the warning appears within a second of the send.
