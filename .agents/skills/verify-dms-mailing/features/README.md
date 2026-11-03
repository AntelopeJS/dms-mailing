# Feature map

One file per feature. `covers:` lists the source globs it owns, `docs:` the pages a verdict judges, `journeys/<feature>.mjs` its journeys and `seeded-breaks/<feature>.patch` the break its journeys must catch.

| Feature | What the user does | Journeys |
|---|---|---|
| [smoke](smoke.md) | The fixed journey every verdict runs: a first test send. | smoke |
