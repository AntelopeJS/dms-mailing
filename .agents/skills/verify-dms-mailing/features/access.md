---
covers:
  - packages/dms-mailing/src/services/permissions.ts
  - packages/dms-mailing/src/permissions.ts
  - packages/dms-mailing/src/realtime.ts
  - packages/dms-mailing/src/hooks/**
  - packages/dms-mailing/src/constants.ts
docs:
  - packages/dms-mailing/docs/5.extending.md
---

# Access

Who reaches the mailing routes and pages, the `mailing.send` permission, the `mailing:sends` realtime topic and the tenant data export contributor.

## Sub-features

- `every-mailing-route-answers-401-without-a-session-and-403-to-a-member`: 20 routes, nobody and a member holding every mailing permission, the owner, a wildcard role.
- `the-webhook-is-the-one-route-that-needs-no-session`.
- `the-mailing-pages-are-the-owners-only`: the five pages for the owner and for a member.
- `new-sends-and-events-appear-on-an-open-sends-page-without-a-reload`: the realtime topic on a second tab.
- `the-workspace-data-export-carries-templates-versions-settings-and-suppressions`: the archive, paging beyond 200 rows, no secret.

## How to get to it (user POV)

- Modules › Mailing for the owner; Settings › the workspace data export for the archive.

## Driving it with dms-control

```bash
dms-control journey "$RUN" access
```

Members come from `member(ctx, name, permissions)`; the export archive is built by the playground's `POST /verify-mailing/export` and read with `unzip`.

## Gotchas

- Module pages are owner-only in the DMS: a member holding every mailing permission id still gets `Forbidden: missing permission modules.mailing.<page>`, so the `mailing.send` gate (`missing_send_permission`) is never reached by a member.
- The Sends page holds new rows behind "1 new send / Show", and the figures window ends when the page loaded.
