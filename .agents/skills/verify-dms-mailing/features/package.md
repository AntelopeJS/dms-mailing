---
covers:
  - packages/dms-mailing/package.json
  - packages/dms-mailing/skills/**
  - packages/dms-mailing/frontend-vue/package.json
  - packages/dms-mailing/frontend-vue/i18n/**
  - packages/dms-mailing/frontend-vue/dms.frontend.ts
  - packages/dms-mailing/frontend-vue/dms.frontend.build.ts
  - packages/dms-mailing/frontend-vue/build/**
  - packages/dms-mailing/src/frontend-module.ts
  - packages/interface-dms-mailing/package.json
docs:
  - packages/dms-mailing/docs/2.installation.md
  - packages/dms-mailing/README.md
---

# Package

What a project installs from the registry: the module with its build, dashboard layer and skill, the interface with its contract, and the ranges the compatibility table names.

## Sub-features

- `the-module-tarball-holds-what-its-manifest-names`: the module's tarball holds the build, the dashboard layer with its locales, the agent skill and every path its manifest points at, without build info or test files.
- `the-interface-tarball-exports-the-contract`: the interface's tarball holds its build and its consumer reference, and its root export carries every function, constant and type the docs name.
- `ranges-match-the-compatibility-table`: the README compatibility table lists the interface ranges the module depends on, its interface range accepts the interface in the tree, and the dashboard layer pins its renderer minor.

## How to get to it (user POV)

- `ajs project modules add @antelopejs/dms-mailing`.

## Driving it with dms-control

```bash
dms-control journey "$RUN" package
```

## Gotchas

- The journeys pack with `npm pack --ignore-scripts` into a temporary folder and read the tarball; nothing is published.
