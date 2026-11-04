---
covers:
  - packages/dms-mailing/frontend-vue/app/components/SendDrawer.vue
  - packages/dms-mailing/frontend-vue/app/components/FixAddressModal.vue
  - packages/dms-mailing/frontend-vue/app/components/RenderingModal.vue
  - packages/dms-mailing/frontend-vue/app/utils/send-actions.ts
  - packages/dms-mailing/frontend-vue/app/utils/problems.ts
  - packages/dms-mailing/frontend-vue/app/utils/timeline.ts
  - packages/dms-mailing/frontend-vue/app/utils/send-values.ts
  - packages/dms-mailing/frontend-vue/app/utils/send-link.ts
  - packages/dms-mailing/frontend-vue/app/utils/rendering-title.ts
docs:
  - packages/dms-mailing/docs/4.usage/4.sends.md
  - packages/dms-mailing/docs/5.extending.md
---

# Sends drawer

The drawer of a send: its place in the log, J and K, the URL, the width, the plain-language problem, the timeline with the details of each event, the origin, the data, the footer by status, Send again and Send to another address.

## Sub-features

- `drawer-opens-steps-keeps-its-url-and-closes`: a click opens the send in a drawer headed by recipient and template and its place in the log; J and K step; the URL keeps the send; Escape or a click beside closes it.
- `drawer-width-is-dragged-and-remembered`: dragging the drawer's left edge widens it, a wide drawer puts the timeline and the origin side by side, and the drawer opens again at the width given.
- `drawer-footer-follows-the-status`: the drawer footer offers the actions of the send's status, a suppressed send whose address was reactivated offers Send again…, a send sent again offers none.
- `drawer-explains-the-problem-timeline-origin-and-data`: the drawer says in plain words what went wrong, lists the timeline with the provider's answer, the origin, and the data sent.
- `send-again-from-the-drawer-is-confirmed-and-resolves-the-problem`: Send again… asks for confirmation with the recipient, the version and the last error, sends, and the original is marked Resolved with no second send again.
- `send-to-another-address-checks-the-corrected-address`: Send to another address refuses an empty, invalid or identical address with its message, then sends to the corrected one.
- `the-timeline-shows-the-url-and-the-user-agent-of-open-and-click-events`: the timeline of a send shows the user agent on its Opened step and the link on its Clicked step, and the provider's reason before them when an event carries both.
## How to get to it (user POV)

- Modules › Mailing › Sends, a row.

## Driving it with dms-control

```bash
dms-control journey "$RUN" sends-drawer
```

## Gotchas

None yet.
