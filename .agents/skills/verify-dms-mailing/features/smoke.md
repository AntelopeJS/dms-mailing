---
covers:
  - packages/dms-mailing/src/index.ts
docs:
  - packages/dms-mailing/docs/1.introduction.md
---

# Smoke

The fixed journey every verdict runs, whatever the diff touches: the introduction's "A first test send".

## Sub-features

- `smoke`: an owner creates a template from a starter, sends a test to an address, and finds it in Sends and in the mail sink.

## How to get to it (user POV)

- Modules › Mailing › Templates, New template, a starter; Test; Mailing › Sends.

## Driving it with dms-control

```bash
dms-control journey "$RUN" smoke
```

## Gotchas

None yet.
