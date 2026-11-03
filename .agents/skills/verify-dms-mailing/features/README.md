# Feature map

One file per feature. `covers:` lists the source globs it owns, `docs:` the pages a verdict judges, `journeys/<feature>.mjs` its journeys and `seeded-breaks/<feature>.patch` the break its journeys must catch.

| Feature | What the user does | Journeys |
|---|---|---|
| [smoke](smoke.md) | The fixed journey every verdict runs: a first test send. | smoke |
| [package](package.md) | What a project installs from the registry: the module, its dashboard layer and skill, the interface, and the ranges the README table names. | the-module-tarball-holds-what-its-manifest-names, the-interface-tarball-exports-the-contract, ranges-match-the-compatibility-table |
