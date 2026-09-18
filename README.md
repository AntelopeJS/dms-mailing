# dms-mailing

Mailing for the AntelopeJS DMS, released from this workspace as two packages.

| Package | Directory | What it holds |
| --- | --- | --- |
| `@antelopejs/dms-mailing` | [`packages/dms-mailing`](./packages/dms-mailing) | The module itself: template library, block editor, send log, delivery metrics. Its README documents the module. |
| `@antelopejs/interface-dms-mailing` | [`packages/interface-dms-mailing`](./packages/interface-dms-mailing) | The interface other modules consume: `SendTemplate` and `RecordEmailEvent`. |

Both are public packages on npm, published under the `@antelopejs` scope with
npm trusted publishing and provenance, each from its own manually dispatched
workflow. Releasing the module is refused until the interface version its
dependency range is floored at is published.

```sh
pnpm install --filter @antelopejs/dms-mailing... --frozen-lockfile
pnpm --dir packages/dms-mailing lint
```
